import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import globalState from '../globalState';
import { LeekFundConfig } from '../shared/leekConfig';
import { LeekTreeItem } from '../shared/leekTreeItem';
import { defaultFundInfo, SortType } from '../shared/typed';
import FundService from './fundService';

export class FundProvider implements TreeDataProvider<LeekTreeItem> {
  private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();

  readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

  private service: FundService;
  private defaultOrder: SortType;
  // 每个基金分组的独立排序，key 为分组节点 id（fundGroup_{index}）
  private groupOrders: Map<string, SortType> = new Map();

  constructor(service: FundService) {
    this.service = service;
    this.defaultOrder = LeekFundConfig.getConfig('leek-fund.fundSort') || SortType.NORMAL;
  }

  refresh(): any {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * 获取某个分组的排序方式
   */
  private getGroupOrder(groupId: string): SortType {
    if (!this.groupOrders.has(groupId)) {
      this.groupOrders.set(groupId, this.defaultOrder);
    }
    return this.groupOrders.get(groupId)!;
  }

  /**
   * 拖拽手动排序时调用：将指定分组的排序方式重置为不排序，使手动顺序生效
   */
  resetOrder(groupId: string): void {
    this.groupOrders.set(groupId, SortType.NORMAL);
  }

  private getSortDescription(groupId: string): string {
    const order = this.getGroupOrder(groupId);
    if (order === SortType.ASC) {
      return '↑升序';
    }
    if (order === SortType.DESC) {
      return '↓降序';
    }
    if (order === SortType.AMOUNTASC) {
      return '↑金额升序';
    }
    if (order === SortType.AMOUNTDESC) {
      return '↓金额降序';
    }
    return '';
  }

  getChildren(element?: LeekTreeItem | undefined): LeekTreeItem[] | Thenable<LeekTreeItem[]> {
    if (!element) {
      return this.getRootNodes(globalState.fundGroups, globalState.fundLists);
    } else {
      return this.getChildrenNodes(element, globalState.fundLists);
    }
  }

  getRootNodes(fundGroups: Array<string>, fundLists: Array<Array<string>>): Array<LeekTreeItem> {
    let nodes: Array<LeekTreeItem> = [];
    fundLists.forEach((value, index) => {
      nodes.push(
        new LeekTreeItem(
          Object.assign({ contextValue: 'category' }, defaultFundInfo, {
            id: `fundGroup_${index}`,
            name: `${fundGroups[index]}${value.length > 0 ? `(${value.length})` : ''}`,
          }),
          undefined,
          true
        )
      );
    });
    return nodes;
  }

  getChildrenNodes(element: LeekTreeItem, fundLists: Array<Array<string>>): Promise<Array<LeekTreeItem>> {
    const groupId = element.id || '';
    const index: number = parseInt(groupId.replace('fundGroup_', ''));
    const fundCodes: Array<string> = fundLists[index];
    return this.service.getData(fundCodes, this.getGroupOrder(groupId), groupId);
  }

  getParent(): LeekTreeItem | null {
    return null;
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
        collapsibleState: TreeItemCollapsibleState.Expanded,
        // iconPath: this.parseIconPathFromProblemState(element),
        command: undefined,
        contextValue: element.contextValue,
      };
    }
  }

  /**
   * 切换某个分组的排序方式（不排序 → 升序 → 降序 循环）
   */
  changeOrder(groupId?: string): void {
    const key = groupId || 'fundGroup_0';
    let order = this.getGroupOrder(key) as number;

    /* fix: 如果基金排序先前是按照持仓金额升序/降序, 按涨跌排序失效的问题 */
    if (Math.abs(order) > 1) {
      order = SortType.NORMAL;
    }

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

  /**
   * 切换某个分组的持仓金额排序方式
   */
  changeAmountOrder(groupId?: string): void {
    const key = groupId || 'fundGroup_0';
    const order = this.getGroupOrder(key) as number;

    if (order === SortType.AMOUNTDESC) {
      this.groupOrders.set(key, SortType.AMOUNTASC);
    } else if (order === SortType.AMOUNTASC) {
      this.groupOrders.set(key, SortType.AMOUNTDESC);
    } else {
      this.groupOrders.set(key, SortType.AMOUNTDESC);
    }
    this.refresh();
  }
}
