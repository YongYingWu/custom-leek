/*--------------------------------------------------------------
 *  Copyright (c) Nicky<giscafer@outlook.com>. All rights reserved.
 *  Github: https://github.com/giscafer
 *-------------------------------------------------------------*/

import { window, workspace } from 'vscode';
import globalState from '../globalState';
import { clean, uniq, events } from './utils';
import { compact, flattenDeep } from 'lodash';

export class BaseConfig {
  /**
   * 获取全局（用户）配置对象
   */
  protected static getGlobalConfig() {
    return workspace.getConfiguration(undefined, null);
  }

  /**
   * 获取全局配置值（字符串数组类型）
   */
  protected static getGlobalConfigArray(key: string, defaultValue: string[] = []): string[] {
    const config = this.getGlobalConfig();
    const configInspect = config.inspect(key);
    return (configInspect?.globalValue as string[]) ?? config.get(key, defaultValue);
  }

  static getConfig(key: string, defaultValue?: any): any {
    const value = this.getGlobalConfigArray(key);
    return value === undefined ? defaultValue : value;
  }

  static setConfig(cfgKey: string, cfgValue: Array<any> | string | number | Object) {
    events.emit('updateConfig:' + cfgKey, cfgValue);
    const config = this.getGlobalConfig();
    return config.update(cfgKey, cfgValue, true);
  }

  static async updateConfig(cfgKey: string, codes: Array<string>) {
    const config = this.getGlobalConfig();
    // 优先使用全局配置值
    const origin = this.getGlobalConfigArray(cfgKey);
    let newCodes = uniq(compact(origin.concat(codes)));
    console.log(`🚀 ~ BaseConfig ~ updateConfig ~ ${cfgKey}:`, newCodes);
    await config.update(cfgKey, newCodes, true);
    return newCodes;
  }

  static removeConfig(cfgKey: string, code: string) {
    const config = this.getGlobalConfig();
    // 优先使用全局配置值
    const sourceCfg = this.getGlobalConfigArray(cfgKey);
    const newCfg = sourceCfg.filter((item: string) => item !== code);
    if (sourceCfg.length === newCfg.length) {
      window.showInformationMessage(
        `删除期货不成功。请 [点击此处](https://github.com/LeekHub/leek-fund/issues/281) 查看期货相关问题`
      );
    }
    return config.update(cfgKey, newCfg, true);
  }
}

export class LeekFundConfig extends BaseConfig {
  constructor() {
    super();
  }
  // Fund Begin
  static addFundGroupCfg(name: string, cb?: Function) {
    globalState.fundGroups.push(name);
    globalState.fundLists.push([]);
    this.setConfig('leek-fund.fundGroups', globalState.fundGroups);
    this.setConfig('leek-fund.funds', globalState.fundLists);
    window.showInformationMessage(`Fund Group Successfully add.`);
    if (cb && typeof cb === 'function') {
      cb(name);
    }
  }

  static renameFundGroupCfg(groupId: string, name: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('fundGroup_', ''));
    globalState.fundGroups[index] = name;
    this.setConfig('leek-fund.fundGroups', globalState.fundGroups);
    window.showInformationMessage(`Fund Group Successfully rename.`);
    if (cb && typeof cb === 'function') {
      cb(groupId);
    }
  }

  static removeFundGroupCfg(groupId: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('fundGroup_', ''));
    const removedFundList: Array<string> = globalState.fundLists[index];
    const removeFundGroup = () => {
      globalState.fundGroups.splice(index, 1);
      globalState.fundLists.splice(index, 1);
      this.setConfig('leek-fund.fundGroups', globalState.fundGroups);
      this.setConfig('leek-fund.funds', globalState.fundLists);
      window.showInformationMessage(`Fund Group Successfully delete.`);
      if (cb && typeof cb === 'function') {
        cb(groupId);
      }
    };

    if (removedFundList.length) {
      window
        .showInformationMessage('删除分组会清空基金数据无法恢复，请确认！！', '好的', '取消')
        .then((res) => {
          if (res === '好的') {
            removeFundGroup();
          }
        });
    } else {
      removeFundGroup();
    }
  }

  static addFundCfg(groupId: string, code: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('fundGroup_', ''));
    const funds = globalState.fundLists[index] as Array<string | number>;
    let updatedFunds = [...funds, code];
    updatedFunds = clean(updatedFunds);
    updatedFunds = uniq(updatedFunds);
    globalState.fundLists[index] = updatedFunds as never;
    this.setConfig('leek-fund.funds', globalState.fundLists);
    window.showInformationMessage(`Fund Successfully add.`);
    if (cb && typeof cb === 'function') {
      cb(code);
    }
  }

  static removeFundCfg(code: string, cb?: Function) {
    const codeComponents = code.split('_');
    if (codeComponents.length < 3) {
      window.showInformationMessage(`Fund Id error.`);
      return;
    }
    const index: number = parseInt(codeComponents[1]);
    const fundCode: string = codeComponents[2];
    const funds = globalState.fundLists[index] as Array<string | number>;
    let updatedFunds = funds;
    updatedFunds.splice(updatedFunds.indexOf(fundCode), 1);
    updatedFunds = clean(updatedFunds);
    updatedFunds = uniq(updatedFunds);
    globalState.fundLists[index] = updatedFunds as never;
    this.setConfig('leek-fund.funds', globalState.fundLists);
    window.showInformationMessage(`Fund Successfully delete.`);
    if (cb && typeof cb === 'function') {
      cb(code);
    }
  }

  static setFundTopCfg(code: string, cb?: Function) {
    const codeComponents = code.split('_');
    if (codeComponents.length < 3) {
      window.showInformationMessage(`Fund Id error.`);
      return;
    }
    const index: number = parseInt(codeComponents[1]);
    const fundCode: string = codeComponents[2];
    const funds = globalState.fundLists[index] as Array<string>;
    const updatedFunds = [fundCode, ...funds.filter((item) => item !== fundCode)];
    globalState.fundLists[index] = updatedFunds as never;
    this.setConfig('leek-fund.funds', globalState.fundLists);
    window.showInformationMessage(`Fund Successfully set to top.`);
    if (cb && typeof cb === 'function') {
      cb(code);
    }
  }
  // Fund End

  // Stock Begin
  /**
   * 解析分组内股票节点的复合 id（格式：stockGroup_{index}_{code}）
   * 返回 null 表示不是分组内的节点（如市场分类下的股票，id 就是 code）
   * groupIndex 为 -1 时表示固定「持仓」分组（stockGroup_held_{code}）
   */
  static parseStockGroupItemId(id: string): { groupIndex: number; code: string } | null {
    if (!id || !id.startsWith('stockGroup_')) {
      return null;
    }
    const rest = id.substring('stockGroup_'.length);
    const sep = rest.indexOf('_');
    if (sep < 0) {
      return null;
    }
    const indexStr = rest.substring(0, sep);
    return {
      groupIndex: indexStr === 'held' ? -1 : parseInt(indexStr),
      code: rest.substring(sep + 1),
    };
  }

  static addStockGroupCfg(name: string, cb?: Function) {
    globalState.stockGroups.push(name);
    globalState.stockGroupLists.push([]);
    this.setConfig('leek-fund.stockGroups', globalState.stockGroups);
    this.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists);
    window.showInformationMessage(`Stock Group Successfully add.`);
    if (cb && typeof cb === 'function') {
      cb(name);
    }
  }

  static renameStockGroupCfg(groupId: string, name: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('stockGroup_', ''));
    globalState.stockGroups[index] = name;
    this.setConfig('leek-fund.stockGroups', globalState.stockGroups);
    window.showInformationMessage(`Stock Group Successfully rename.`);
    if (cb && typeof cb === 'function') {
      cb(groupId);
    }
  }

  static removeStockGroupCfg(groupId: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('stockGroup_', ''));
    const removedStockList: Array<string> = globalState.stockGroupLists[index] || [];
    const removeStockGroup = () => {
      globalState.stockGroups.splice(index, 1);
      globalState.stockGroupLists.splice(index, 1);
      this.setConfig('leek-fund.stockGroups', globalState.stockGroups);
      this.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists);
      window.showInformationMessage(`Stock Group Successfully delete.`);
      if (cb && typeof cb === 'function') {
        cb(groupId);
      }
    };

    if (removedStockList.length) {
      window
        .showInformationMessage(
          '删除分组不会影响股票数据，组内股票仍会在默认市场分类中显示，请确认！',
          '好的',
          '取消'
        )
        .then((res) => {
          if (res === '好的') {
            removeStockGroup();
          }
        });
    } else {
      removeStockGroup();
    }
  }

  /**
   * 将股票加入指定自定义分组（支持一只股票同时属于多个分组）
   */
  static addStockToGroupCfg(groupId: string, code: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('stockGroup_', ''));
    const list = globalState.stockGroupLists[index] || [];
    if (list.includes(code)) {
      window.showInformationMessage(`Stock Already in this group.`);
      if (cb && typeof cb === 'function') {
        cb(code);
      }
      return;
    }
    globalState.stockGroupLists[index] = uniq(clean([...list, code])) as string[];
    this.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists);
    if (cb && typeof cb === 'function') {
      cb(code);
    }
  }

  /**
   * 将股票从指定分组中移除，不影响其他分组和自选列表
   */
  static removeStockFromGroupCfg(groupId: string, code: string, cb?: Function) {
    const index: number = parseInt(groupId.replace('stockGroup_', ''));
    const list = globalState.stockGroupLists[index] || [];
    globalState.stockGroupLists[index] = list.filter((item) => item !== code);
    this.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists);
    window.showInformationMessage(`Stock Successfully removed from group.`);
    if (cb && typeof cb === 'function') {
      cb(code);
    }
  }

  static updateStockCfg(list: string, cb?: Function) {
    const cfgKey = 'leek-fund.stocks';
    const config = this.getGlobalConfig();
    // 优先使用全局配置值
    const origin = this.getGlobalConfigArray(cfgKey);
    let codes = typeof list === 'string' ? list.split(',') : list;
    let newCodes = uniq(compact(flattenDeep(origin).concat(codes))) as string[];
    newCodes = newCodes.map((code: string) => {
      if (code.startsWith('hk')) {
        return code.toLowerCase();
      }
      return code;
    });
    config.update(cfgKey, newCodes, true).then(() => {
      window.showInformationMessage(`Stock Successfully add.`);
      if (cb && typeof cb === 'function') {
        cb(codes, newCodes);
      }
    });
  }

  static removeStockCfg(code: string, cb?: Function) {
    // 同步从所有自定义分组中移除
    const cleanedLists = (globalState.stockGroupLists || []).map((list) =>
      (list || []).filter((item) => item !== code)
    );
    const groupChanged = cleanedLists.some(
      (list, i) => list.length !== (globalState.stockGroupLists[i] || []).length
    );
    if (groupChanged) {
      globalState.stockGroupLists = cleanedLists;
      this.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists);
    }
    this.removeConfig('leek-fund.stocks', code).then(() => {
      window.showInformationMessage(`Stock Successfully delete.`);
      if (cb && typeof cb === 'function') {
        cb(code);
      }
    });
  }

  static addStockToBarCfg(code: string, cb?: Function) {
    const addStockToBar = () => {
      let configArr: string[] = this.getConfig('leek-fund.statusBarStock');
      if (configArr.length >= 4) {
        window.showInformationMessage(`StatusBar Exceeding Length.`);
        if (cb && typeof cb === 'function') {
          cb(code);
        }
      } else if (configArr.includes(code)) {
        window.showInformationMessage(`StatusBar Already Have.`);
        if (cb && typeof cb === 'function') {
          cb(code);
        }
      } else {
        configArr.push(code);
        this.setConfig('leek-fund.statusBarStock', configArr).then(() => {
          window.showInformationMessage(`Stock Successfully add to statusBar.`);
          if (cb && typeof cb === 'function') {
            cb(code);
          }
        });
      }
    };

    if (this.getConfig('leek-fund.hideStatusBarStock')) {
      this.setConfig('leek-fund.hideStatusBarStock', false).then(() => {
        addStockToBar();
      });
    } else {
      addStockToBar();
    }
  }

  static setStockTopCfg(code: string, cb?: Function) {
    const groupItem = this.parseStockGroupItemId(code);
    if (groupItem && groupItem.groupIndex >= 0) {
      // 分组内置顶
      const list = globalState.stockGroupLists[groupItem.groupIndex] || [];
      globalState.stockGroupLists[groupItem.groupIndex] = [
        groupItem.code,
        ...list.filter((item) => item !== groupItem.code),
      ];
      this.setConfig('leek-fund.stockGroupLists', globalState.stockGroupLists).then(() => {
        window.showInformationMessage(`Stock successfully set to top.`);
        if (cb && typeof cb === 'function') {
          cb(code);
        }
      });
      return;
    }
    // 持仓分组等虚拟分组的节点，置顶作用于市场分类顺序
    const flatCode = groupItem ? groupItem.code : code;
    let arr: string[] = this.getConfig('leek-fund.stocks');
    // 临时解决3.10.1~3.10.3 pr产生的分组bug
    const stockList = flattenDeep(arr).filter?.((item) => item !== flatCode);
    stockList.unshift(flatCode);

    this.setConfig('leek-fund.stocks', stockList).then(() => {
      window.showInformationMessage(`Stock successfully set to top.`);
      if (cb && typeof cb === 'function') {
        cb(flatCode);
      }
    });
  }

  /**
   * 将股票标记为已清仓（保留持仓数量等数据，从固定「持仓」分组移除，不影响自选与自定义分组）
   */
  static markStockSellOutCfg(code: string, cb?: Function) {
    const stockPrice = { ...(this.getConfig('leek-fund.stockPrice') || {}) };
    if (!stockPrice[code]) {
      window.showInformationMessage(`该股票没有持仓数据`);
      return;
    }
    stockPrice[code] = { ...stockPrice[code], isSellOut: true };
    globalState.stockPrice = stockPrice;
    this.setConfig('leek-fund.stockPrice', stockPrice).then(() => {
      window.showInformationMessage(`Stock Successfully marked as sold out.`);
      if (cb && typeof cb === 'function') {
        cb(code);
      }
    });
  }

  // Stock End

  // Binance Begin
  static updateBinanceCfg(codes: string, cb?: Function) {
    this.updateConfig('leek-fund.binance', codes.split(',')).then(() => {
      window.showInformationMessage(`Pair Successfully add.`);
      if (cb && typeof cb === 'function') {
        cb(codes);
      }
    });
  }
  static removeBinanceCfg(code: string, cb?: Function) {
    this.removeConfig('leek-fund.binance', code).then(() => {
      window.showInformationMessage(`Pair Successfully delete.`);
      if (cb && typeof cb === 'function') {
        cb(code);
      }
    });
  }
  static setBinanceTopCfg(code: string, cb?: Function) {
    let configArr: string[] = this.getConfig('leek-fund.binance');
    configArr = [code, ...configArr.filter((item) => item !== code)];
    this.setConfig('leek-fund.binance', configArr).then(() => {
      window.showInformationMessage(`Pair successfully set to top.`);
      if (cb && typeof cb === 'function') {
        cb(code);
      }
    });
  }
  // Binance end

  // StatusBar Begin
  static updateStatusBarStockCfg(codes: Array<string>, cb?: Function) {
    const updateStatusBarStock = () => {
      this.setConfig('leek-fund.statusBarStock', codes).then(() => {
        window.showInformationMessage(`Status Bar Stock Successfully update.`);
        if (cb && typeof cb === 'function') {
          cb(codes);
        }
      });
    };

    if (codes.length) {
      if (this.getConfig('leek-fund.hideStatusBarStock')) {
        this.setConfig('leek-fund.hideStatusBarStock', false).then(() => {
          updateStatusBarStock();
        });
      } else {
        updateStatusBarStock();
      }
    } else {
      if (!this.getConfig('leek-fund.hideStatusBarStock')) {
        this.setConfig('leek-fund.hideStatusBarStock', true).then(() => {
          updateStatusBarStock();
        });
      } else {
        updateStatusBarStock();
      }
    }
  }
  // StatusBar End
}
