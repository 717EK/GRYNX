import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const OUT = './_shots'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = {
  iphone: { width: 390, height: 844 },
  ipad: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
}

const browser = await chromium.launch()

async function pinAndEnter(page) {
  for (let i = 0; i < 6; i++) {
    await page.locator('.pin__box').nth(i).fill(String(i + 1))
  }
  await page.click('.login__enter',{force:true})
  await page.waitForTimeout(250)
}

async function overflow(page, sel) {
  return page.$eval(sel, (el) => el.scrollHeight - el.clientHeight).catch(() => null)
}

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important}',
  })
  await page.waitForTimeout(700) // font swap
  await page.screenshot({ path: `${OUT}/login-${name}.png` })

  await pinAndEnter(page)
  await page.screenshot({ path: `${OUT}/home-${name}.png` })

  // Create Job
  await page.locator('.navrow').first().click({ force: true })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/create-${name}.png` })
  const createOf = await overflow(page, '.jobscreen__scroll')

  // Pipeline editor modal
  await page.click('.editpipe',{force:true})
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/create-pipe-${name}.png` })
  await page.click('.modal__x',{force:true})

  // PPC review
  await page.click('.jobscreen__pill',{force:true})
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/ppc-${name}.png` })

  // back to home -> overview
  await page.click('.jobscreen__back',{force:true}) // -> create
  await page.waitForTimeout(150)
  await page.click('.jobscreen__back',{force:true}) // -> home
  await page.waitForTimeout(150)
  await page.click('.admin__stats',{force:true})
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/overview-${name}.png` })

  console.log(`${name}: create-scroll-overflow=${createOf}px`)
  await ctx.close()
}

await browser.close()
console.log('done')
