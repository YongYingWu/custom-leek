import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
// import { compact, flattenDeep, uniq } from 'lodash';
import globalState from '../globalState';
import { LeekTreeItem } from '../shared/leekTreeItem';
import { defaultFundInfo, SortType, StockCategory } from '../shared/typed';
import { LeekFundConfig } from '../shared/leekConfig';
import { getHeldStocks } from '../shared/heldStocks';
import { normalizeStockCode, sortData } from '../shared/utils';
import StockService from './stockService';

/**
 * 固定「持仓」分组的节点 id，成员由 leek-fund.stockPrice（成本设置）自动决定
 */
export const STOCK_HELD_GROUP_ID = 'stockGroup_held';

export class StockProvider implements TreeDataProvider<LeekTreeItem> {
  private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();

  readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

  private service: StockService;
  private defaultOrder: SortType;
  // 每个市场分类/自定义分组的独立排序，key 为节点 id
  private groupOrders: Map<string, SortType> = new Map();
  private expandAStock: boolean;
  private expandHKStock: boolean;
  private expandUSStock: boolean;
  private expandCNFuture: boolean;
  private expandOverseaFuture: boolean;

  constructor(service: StockService) {
    this.service = service;
    this.defaultOrder = LeekFundConfig.getConfig('leek-fund.stockSort') || SortType.NORMAL;
    this.expandAStock = LeekFundConfig.getConfig('leek-fund.expandAStock', true);
    this.expandHKStock = LeekFundConfig.getConfig('leek-fund.expandHKStock', false);
    this.expandUSStock = LeekFundConfig.getConfig('leek-fund.expandUSStock', false);
    this.expandCNFuture = LeekFundConfig.getConfig('leek-fund.expandCNFuture', false);
    this.expandOverseaFuture = LeekFundConfig.getConfig('leek-fund.expandOverseaFuture', false);
  }

  refresh(): any {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * 获取某个市场分类/分组节点的排序方式
   */
  private getOrder(containerId: string): SortType {
    if (!this.groupOrders.has(containerId)) {
      this.groupOrders.set(containerId, this.defaultOrder);
    }
    return this.groupOrders.get(containerId)!;
  }

  /**
   * 拖拽手动排序时调用：将指定容器的排序方式重置为不排序，使手动顺序生效
   */
  resetOrder(containerId: string): void {
    this.groupOrders.set(containerId, SortType.NORMAL);
  }

  private getSortDescription(containerId: string): string {
    const order = this.getOrder(containerId);
    if (order === SortType.ASC) {
      return '↑';
    }
    if (order === SortType.DESC) {
      return '↓';
    }
    return '';
  }

  getChildren(element?: LeekTreeItem | undefined): LeekTreeItem[] | Thenable<LeekTreeItem[]> {
    if (!element) {
      // Root view
      const stockCodes = LeekFundConfig.getConfig('leek-fund.stocks') || [];
      // const stockList: string[] = uniq(compact(flattenDeep(stockCodes)));
      // 拉取时不排序，由各市场分类/分组节点按各自的排序方式展示
      return this.service.getData(stockCodes, SortType.NORMAL).then(() => {
        return this.getRootNodes();
      });
    } else {
      const resultPromise = Promise.resolve(this.service.stockList || []);
      const elementId = element.id || '';
      // 固定「持仓」分组节点
      if (elementId === STOCK_HELD_GROUP_ID) {
        return this.getHeldStockNodes(resultPromise);
      }
      // 自定义分组节点
      if (elementId.startsWith('stockGroup_')) {
        return this.getGroupStockNodes(resultPromise, elementId);
      }
      switch (
        elementId // First-level
      ) {
        case StockCategory.A:
          return this.getAStockNodes(resultPromise);
        case StockCategory.HK:
          return this.getHkStockNodes(resultPromise);
        case StockCategory.US:
          return this.getUsStockNodes(resultPromise);
        case StockCategory.Future:
          return this.getFutureStockNodes(resultPromise);
        case StockCategory.OverseaFuture:
          return this.getOverseaFutureStockNodes(resultPromise);
        case StockCategory.NODATA:
          return this.getNoDataStockNodes(resultPromise);
        default:
          return [];
        // return this.getChildrenNodesById(element.id);
      }
    }
  }

  /**
   * 支持 TreeView.reveal：返回股票节点的父节点（分组节点或市场分类节点）
   */
  getParent(element?: LeekTreeItem): LeekTreeItem | undefined {
    if (!element || element.isCategory) {
      return undefined;
    }
    const id = element.id || '';
    const groupItem = LeekFundConfig.parseStockGroupItemId(id);
    if (groupItem) {
      if (groupItem.groupIndex === -1) {
        // 固定「持仓」分组
        return this.createCategoryNode(STOCK_HELD_GROUP_ID, '持仓', 'category');
      }
      return this.createCategoryNode(
        `stockGroup_${groupItem.groupIndex}`,
        globalState.stockGroups[groupItem.groupIndex] || '',
        'stockGroup'
      );
    }
    const type = element.type || '';
    let categoryId: string | null = null;
    if (/^(sh|sz|bj)/.test(type)) {
      categoryId = StockCategory.A;
    } else if (/^hk/.test(type)) {
      categoryId = StockCategory.HK;
    } else if (/^usr_/.test(type)) {
      categoryId = StockCategory.US;
    } else if (/^nf_/.test(type)) {
      categoryId = StockCategory.Future;
    } else if (/^hf_/.test(type)) {
      categoryId = StockCategory.OverseaFuture;
    } else if (type === 'nodata') {
      categoryId = StockCategory.NODATA;
    }
    if (!categoryId) {
      return undefined;
    }
    return this.createCategoryNode(categoryId, categoryId, 'category');
  }

  private createCategoryNode(id: string, name: string, contextValue: string): LeekTreeItem {
    return new LeekTreeItem(
      Object.assign({ contextValue }, defaultFundInfo, { id, name }),
      undefined,
      true
    );
  }

  getTreeItem(element: LeekTreeItem): TreeItem {
    if (!element.isCategory) {
      return element;
    } else {
      return {
        id: element.id,
        label: element.info.name,
        description: this.getSortDescription(element.id || ''),
        // tooltip: this.getSubCategoryTooltip(element),
        collapsibleState:
          (element.id === StockCategory.A && this.expandAStock) ||
          (element.id === StockCategory.HK && this.expandHKStock) ||
          (element.id === StockCategory.US && this.expandUSStock) ||
          (element.id === StockCategory.Future && this.expandCNFuture) ||
          (element.id === StockCategory.OverseaFuture && this.expandCNFuture) ||
          (element.id || '').startsWith('stockGroup_')
            ? TreeItemCollapsibleState.Expanded
            : TreeItemCollapsibleState.Collapsed,
        // iconPath: this.parseIconPathFromProblemState(element),
        command: undefined,
        contextValue: element.contextValue,
      };
    }
  }

  getRootNodes(): LeekTreeItem[] {
    // 自定义分组是额外的组织维度，市场分类始终显示全部股票
    const stocks = this.service.stockList || [];
    const countOf = (re: RegExp): number =>
      stocks.filter((item: LeekTreeItem) => re.test(item.type || '')).length;
    const aStockCount = countOf(/^(sh|sz|bj)/);
    const hkStockCount = countOf(/^(hk)/);
    const usStockCount = countOf(/^(usr_)/);
    const cnfStockCount = countOf(/^(nf_)/);
    const hfStockCount = countOf(/^(hf_)/);
    const noDataStockCount = countOf(/^(nodata)/);
    const nodes: LeekTreeItem[] = [];
    // 固定「持仓」分组：展示设置了成本价的股票，置顶显示
    const heldCount = getHeldStocks(stocks).length;
    // 固定分组始终显示，哪怕没有持仓股票
    nodes.push(
      new LeekTreeItem(
        // contextValue 用 category（与市场分类一致），右键菜单和置顶按钮不会显示在该节点上
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: STOCK_HELD_GROUP_ID,
          name: heldCount > 0 ? `持仓(${heldCount})` : '持仓',
        }),
        undefined,
        true
      )
    );
    nodes.push(
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.A,
          name: `${StockCategory.A}${aStockCount > 0 ? `(${aStockCount})` : ''}`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.HK,
          name: `${StockCategory.HK}${hkStockCount > 0 ? `(${hkStockCount})` : ''}`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.US,
          name: `${StockCategory.US}${usStockCount > 0 ? `(${usStockCount})` : ''}`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.Future,
          name: `${StockCategory.Future}${cnfStockCount > 0 ? `(${cnfStockCount})` : ''}`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.OverseaFuture,
          name: `${StockCategory.OverseaFuture}${
            hfStockCount > 0 ? `(${hfStockCount})` : ''
          }`,
        }),
        undefined,
        true
      )
    );
    // 显示接口不支持的股票，避免用户老问为什么添加了股票没反应
    if (noDataStockCount) {
      nodes.push(
        new LeekTreeItem(
          Object.assign({ contextValue: 'category' }, defaultFundInfo, {
            id: StockCategory.NODATA,
            name: `${StockCategory.NODATA}(${noDataStockCount})`,
          }),
          undefined,
          true
        )
      );
    }
    // 自定义分组，与市场分类同级
    globalState.stockGroups.forEach((groupName: string, index: number) => {
      const groupCodes: Array<string> = globalState.stockGroupLists[index] || [];
      nodes.push(
        new LeekTreeItem(
          Object.assign({ contextValue: 'stockGroup' }, defaultFundInfo, {
            id: `stockGroup_${index}`,
            name: `${groupName}${groupCodes.length > 0 ? `(${groupCodes.length})` : ''}`,
          }),
          undefined,
          true
        )
      );
    });
    return nodes;
  }

  getGroupStockNodes(stocks: Promise<LeekTreeItem[]>, groupId: string): Promise<LeekTreeItem[]> {
    const index: number = parseInt(groupId.replace('stockGroup_', ''));
    const groupCodes: Array<string> = (globalState.stockGroupLists[index] || []).map(
      (code: string) => normalizeStockCode(code)
    );
    const order = this.getOrder(groupId);
    return stocks.then((res: LeekTreeItem[]) => {
      const groupStocks = res.filter((item: LeekTreeItem) =>
        groupCodes.includes(normalizeStockCode(item.info.code || ''))
      );
      // 按分组内配置顺序展示（置顶/上移/下移依赖该顺序）
      const orderMap = new Map<string, number>();
      groupCodes.forEach((code: string, idx: number) => orderMap.set(code, idx));
      const sortedStocks =
        order === SortType.NORMAL
          ? groupStocks.sort(
              (a, b) =>
                (orderMap.get(normalizeStockCode(a.info.code || '')) ?? 0) -
                (orderMap.get(normalizeStockCode(b.info.code || '')) ?? 0)
            )
          : sortData(groupStocks, order);
      return sortedStocks.map((item: LeekTreeItem) => {
        // 克隆节点并使用复合 id（stockGroup_{index}_{code}），
        // 避免同一只股票出现在多个分组/市场分类时树节点 id 冲突
        const clone = Object.assign(
          Object.create(Object.getPrototypeOf(item)),
          item
        ) as LeekTreeItem;
        clone.id = `${groupId}_${item.info.code}`;
        return clone;
      });
    });
  }

  getAStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    const aStocks: Promise<LeekTreeItem[]> = stocks.then((res: LeekTreeItem[]) => {
      const arr = res.filter((item: LeekTreeItem) => /^(sh|sz|bj)/.test(item.type || ''));
      return sortData(arr, this.getOrder(StockCategory.A));
    });

    return aStocks;
  }
  /**
   * 固定「持仓」分组：成员由成本设置（leek-fund.stockPrice）决定
   */
  getHeldStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    const order = this.getOrder(STOCK_HELD_GROUP_ID);
    return stocks.then((res: LeekTreeItem[]) => {
      const heldStocks = getHeldStocks(res);
      return sortData(heldStocks, order).map((item: LeekTreeItem) => {
        // 克隆节点并使用复合 id，避免与市场分类中的同一股票节点 id 冲突
        const clone = Object.assign(
          Object.create(Object.getPrototypeOf(item)),
          item
        ) as LeekTreeItem;
        clone.id = `${STOCK_HELD_GROUP_ID}_${item.info.code}`;
        // 持仓分组内节点的 contextValue 加 Held 后缀，用于菜单区分（如不显示「置顶」）
        clone.contextValue = item.contextValue ? `${item.contextValue}Held` : 'stockHeld';
        return clone;
      });
    });
  }
  getHkStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      sortData(
        res.filter((item: LeekTreeItem) => /^(hk)/.test(item.type || '')),
        this.getOrder(StockCategory.HK)
      )
    );
  }
  getUsStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      sortData(
        res.filter((item: LeekTreeItem) => /^(usr_)/.test(item.type || '')),
        this.getOrder(StockCategory.US)
      )
    );
  }
  getFutureStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      sortData(
        res.filter((item: LeekTreeItem) => /^(nf_)/.test(item.type || '')),
        this.getOrder(StockCategory.Future)
      )
    );
  }
  getOverseaFutureStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      sortData(
        res.filter((item: LeekTreeItem) => /^(hf_)/.test(item.type || '')),
        this.getOrder(StockCategory.OverseaFuture)
      )
    );
  }
  getNoDataStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) => {
      return sortData(
        res.filter((item: LeekTreeItem) => {
          return /^(nodata)/.test(item.type || '');
        }),
        this.getOrder(StockCategory.NODATA)
      );
    });
  }

  /**
   * 切换某个市场分类/分组的排序方式（不排序 → 升序 → 降序 循环）
   */
  changeOrder(containerId?: string): void {
    const key = containerId || StockCategory.A;
    let order = this.getOrder(key) as number;
    order += 1;
    if (order > 1) {
      this.groupOrders.set(key, SortType.DESC);
    } else if (order === 1) {
      this.groupOrders.set(key, SortType.ASC);
    } else if (order === 0) {
      this.groupOrders.set(key, SortType.NORMAL);
    }
    this.refresh();
  }
}
