import {test,expect} from '@playwright/test';
test('手机首页、中文聊天与预留语音入口',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:/让每一天/})).toBeVisible();
 expect(await page.locator('.portrait img').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('聊天消息').fill('你好');await page.getByLabel('发送消息').click();
 await expect(page.locator('.message.user')).toHaveText('你好');await expect(page.locator('.message.assistant').last()).toContainText('很高兴见到你');
 await page.reload();await page.getByRole('button',{name:'对话',exact:true}).click();await expect(page.locator('.message.user')).toHaveText('你好');
 await page.getByLabel('实时语音（尚未接入）').click();await expect(page.getByRole('dialog')).toContainText('尚未接入');await page.getByRole('button',{name:'知道了'}).click();
 expect(errors).toEqual([]);
});
test('任务添加、完成、持久化与删除',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'任务',exact:true}).click();
 await page.getByLabel('新任务').fill('整理明天的会议资料');await page.getByLabel('添加任务').click();
 await expect(page.locator('.task')).toContainText('整理明天的会议资料');await page.getByLabel('完成任务', {exact:true}).click();await expect(page.locator('.task')).toHaveClass(/done/);
 await page.reload();await page.getByRole('button',{name:'任务',exact:true}).click();await expect(page.locator('.task')).toHaveClass(/done/);
 await page.getByLabel('删除任务').click();await expect(page.locator('.task')).toHaveCount(0);
});
test('窄屏布局',async({page})=>{await page.setViewportSize({width:320,height:740});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)});
