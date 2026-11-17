import {config as base} from './fixtures.mjs';
export const config=structuredClone(base);config.units.push({id:'store-a2',company:'测试公司甲',name:'第二测试门店',type:'超市'});config.warehouses[0].targets.push('store-a2');
