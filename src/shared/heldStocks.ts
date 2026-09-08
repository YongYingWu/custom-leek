import globalState from '../globalState';
import type { LeekTreeItem } from './leekTreeItem';

/**
 * 判断一只股票是否持仓（设置了成本价且持仓数量大于 0）
 * 「已清仓」状态不属于持仓
 * 优先依据 leek-fund.stockPrice 配置实时判断，兼容行情节点上的 heldAmount 字段
 */
export function isHeldStock(item: LeekTreeItem): boolean {
  const code = item?.info?.code || '';
  const stockPrice: any = globalState.stockPrice || {};
  const record = stockPrice[code];
  const amount = Number(record?.amount || item?.info?.heldAmount || 0);
  const isSellOut = record?.isSellOut ?? item?.info?.isSellOut ?? false;
  return amount > 0 && !isSellOut;
}

/**
 * 从股票行情列表中筛选出持仓股票
 */
export function getHeldStocks(stockList: Array<LeekTreeItem> = []): Array<LeekTreeItem> {
  return (stockList || []).filter(isHeldStock);
}

/**
 * 刷新全局持仓股票缓存，供固定「持仓」分组及其他功能使用
 * 调用时机：插件初始化、行情数据刷新、点击刷新按钮、股票成本设置保存后
 */
export function refreshHeldStocks(stockList: Array<LeekTreeItem> = []): Array<LeekTreeItem> {
  globalState.heldStocks = getHeldStocks(stockList);
  return globalState.heldStocks;
}
