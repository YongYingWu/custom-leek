import { DataTransfer, DataTransferItem, TreeDragAndDropController } from 'vscode';
import globalState from '../globalState';
import { LeekFundConfig } from '../shared/leekConfig';
import { LeekTreeItem } from '../shared/leekTreeItem';
import { StockCategory } from '../shared/typed';
import { FundProvider } from './fundProvider';
import { StockProvider } from './stockProvider';

const FUND_MIME = 'application/vnd.code.tree.leekfundview.fund';
const STOCK_MIME = 'application/vnd.code.tree.leekfundview.stock';

/**
 * 解析基金节点 id（格式：fundGroup_{index}_{code}）
 */
function parseFundItemId(id: string): { groupIndex: number; code: string } {
  const rest = id.replace('fundGroup_', '');
  const sep = rest.indexOf('_');
  return { groupIndex: parseInt(rest.substring(0, sep)), code: rest.substring(sep + 1) };
}

/**
 * 在数组中把 code 移动到 beforeCode 之前（beforeCode 为空则移到末尾）
 */
function moveInList(list: string[], code: string, beforeCode?: string) {
  const fromIdx = list.indexOf(code);
  if (fromIdx < 0) {
    return false;
  }
  list.splice(fromIdx, 1);
  let insertIdx = beforeCode ? list.indexOf(beforeCode) : list.length;
  if (insertIdx < 0) {
    insertIdx = list.length;
  }
  list.splice(insertIdx, 0, code);
  return true;
}

/**
 * 根据股票节点的行情类型推断所属市场分类节点 id
 */
function marketCategoryOf(type: string | undefined): string | null {
  if (/^(sh|sz|bj)/.test(type || '')) {
    return StockCategory.A;
  }
  if (/^hk/.test(type || '')) {
    return StockCategory.HK;
  }
  if (/^usr_/.test(type || '')) {
    return StockCategory.US;
  }
  if (/^nf_/.test(type || '')) {
    return StockCategory.Future;
  }
  if (/^hf_/.test(type || '')) {
    return StockCategory.OverseaFuture;
  }
  return null;
}

/**
 * 基金树拖拽：组内排序、跨分组移动
 */
export class FundDragDropController implements TreeDragAndDropController<LeekTreeItem> {
  readonly dropMimeTypes = [FUND_MIME];
  readonly dragMimeTypes = [FUND_MIME];

  constructor(private fundProvider: FundProvider) {}

  handleDrag(source: readonly LeekTreeItem[], dataTransfer: DataTransfer): void {
    const item = source[0];
    // 分组节点不支持拖拽
    if (!item || item.isCategory || !item.id) {
      return;
    }
    dataTransfer.set(FUND_MIME, new DataTransferItem(item.id));
  }

  async handleDrop(
    target: LeekTreeItem | undefined,
    dataTransfer: DataTransfer
  ): Promise<void> {
    const draggedId: string | undefined = dataTransfer.get(FUND_MIME)?.value;
    const targetId = target?.id || '';
    if (!draggedId || !targetId || !targetId.startsWith('fundGroup_')) {
      return;
    }
    if (draggedId === targetId) {
      return;
    }

    const { groupIndex: fromGroup, code } = parseFundItemId(draggedId);
    let toGroup: number;
    let beforeCode: string | undefined;
    if (target!.isCategory) {
      // 目标是分组节点：移动到该分组末尾
      toGroup = parseInt(targetId.replace('fundGroup_', ''));
    } else {
      // 目标是基金节点：插入到该基金之前
      const t = parseFundItemId(targetId);
      toGroup = t.groupIndex;
      beforeCode = t.code;
    }

    const lists = globalState.fundLists;
    const sourceList = (lists[fromGroup] || []) as string[];
    const targetList = (lists[toGroup] || []) as string[];
    const fromIdx = sourceList.indexOf(code);
    if (fromIdx < 0) {
      return;
    }
    sourceList.splice(fromIdx, 1);
    let insertIdx = beforeCode ? targetList.indexOf(beforeCode) : targetList.length;
    if (insertIdx < 0) {
      insertIdx = targetList.length;
    }
    targetList.splice(insertIdx, 0, code);

    await LeekFundConfig.setConfig('leek-fund.funds', globalState.fundLists);
    // 拖拽即手动排序的意图，重置该分组的排序方式使手动顺序生效
    this.fundProvider.resetOrder(`fundGroup_${toGroup}`);
    this.fundProvider.refresh();
  }
}

/**
 * 股票树拖拽：市场分类内排序（调整 leek-fund.stocks 顺序）、
 * 分组内排序、拖入分组（组间拖动为移动，市场分类拖入为加入分组）
 */
export class StockDragDropController implements TreeDragAndDropController<LeekTreeItem> {
  readonly dropMimeTypes = [STOCK_MIME];
  readonly dragMimeTypes = [STOCK_MIME];

  constructor(private stockProvider: StockProvider) {}

  handleDrag(source: readonly LeekTreeItem[], dataTransfer: DataTransfer): void {
    const item = source[0];
    if (!item || item.isCategory || !item.id) {
      return;
    }
    dataTransfer.set(STOCK_MIME, new DataTransferItem(item.id));
  }

  async handleDrop(
    target: LeekTreeItem | undefined,
    dataTransfer: DataTransfer
  ): Promise<void> {
    const draggedId: string | undefined = dataTransfer.get(STOCK_MIME)?.value;
    const targetId = target?.id || '';
    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }

    const draggedParsed = LeekFundConfig.parseStockGroupItemId(draggedId);
    // 固定「持仓」分组的成员由持仓数据决定，拖拽时按未分组股票处理
    const draggedGroup = draggedParsed && draggedParsed.groupIndex >= 0 ? draggedParsed : null;
    const draggedCode = draggedParsed ? draggedParsed.code : draggedId;
    const targetGroup = LeekFundConfig.parseStockGroupItemId(targetId);
    // 「持仓」分组不可拖入（成员由成本设置决定）
    if (targetGroup && targetGroup.groupIndex === -1) {
      return;
    }
    const targetIsGroupNode =
      !!target?.isCategory && targetId.startsWith('stockGroup_') && targetId !== 'stockGroup_held';
    const targetIsMarketNode = !!target?.isCategory && !targetId.startsWith('stockGroup_');

    // 拖到市场分类节点上：无意义，忽略
    if (targetIsMarketNode) {
      return;
    }

    if (targetIsGroupNode || targetGroup) {
      // 目标是分组节点或组内股票
      const toGroupIndex = targetIsGroupNode
        ? parseInt(targetId.replace('stockGroup_', ''))
        : targetGroup!.groupIndex;
      const beforeCode = targetGroup ? targetGroup.code : undefined;
      const code = draggedCode;
      const lists = globalState.stockGroupLists;
      const targetList = lists[toGroupIndex] || [];

      if (draggedGroup && draggedGroup.groupIndex === toGroupIndex) {
        // 组内拖拽 = 组内排序
        if (!moveInList(targetList, code, beforeCode)) {
          return;
        }
      } else {
        // 跨分组拖动 = 移动；市场分类拖入 = 加入分组
        if (draggedGroup) {
          const sourceList = lists[draggedGroup.groupIndex] || [];
          const fromIdx = sourceList.indexOf(code);
          if (fromIdx >= 0) {
            sourceList.splice(fromIdx, 1);
          }
        }
        if (!targetList.includes(code)) {
          let insertIdx = beforeCode ? targetList.indexOf(beforeCode) : targetList.length;
          if (insertIdx < 0) {
            insertIdx = targetList.length;
          }
          targetList.splice(insertIdx, 0, code);
        }
      }

      await LeekFundConfig.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists);
      // 拖拽即手动排序的意图，重置该分组的排序方式使手动顺序生效
      this.stockProvider.resetOrder(`stockGroup_${toGroupIndex}`);
      this.stockProvider.refresh();
      return;
    }

    // 目标是市场分类下的股票：仅支持市场分类之间的排序（调整 leek-fund.stocks 顺序）
    if (draggedGroup || target?.isCategory) {
      return;
    }
    const stocks: string[] = LeekFundConfig.getConfig('leek-fund.stocks') || [];
    if (!moveInList(stocks, draggedCode, targetId)) {
      return;
    }
    await LeekFundConfig.setConfig('leek-fund.stocks', stocks);
    // 拖拽即手动排序的意图，重置该市场分类的排序方式使手动顺序生效
    const marketCategory = marketCategoryOf(target?.type);
    if (marketCategory) {
      this.stockProvider.resetOrder(marketCategory);
    }
    this.stockProvider.refresh();
  }
}
