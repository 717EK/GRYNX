import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5174'
const OUT = './_shots'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = {
  iphone: { width: 390, height: 844 },
  ipad: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
}

const browser = await chromium.launch()
const click = (page, sel) => page.click(sel, { force: true })

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}-${name}.png` })

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important}',
  })
  await page.waitForTimeout(700)
  await shot('login')

  // login
  for (let i = 0; i < 6; i++) await page.locator('.pin__box').nth(i).fill(String(i + 1))
  await click(page, '.login__enter')
  await page.waitForTimeout(250)
  await shot('home')

  // create job
  await page.locator('.navrow').nth(0).click({ force: true })
  await page.waitForTimeout(300)
  await shot('create')

  // product dropdown open
  await click(page, '.csel__btn')
  await page.waitForTimeout(200)
  await shot('create-product')
  await click(page, '.csel__btn')

  // pipeline editor
  await click(page, '.editpipe')
  await page.waitForTimeout(200)
  await shot('create-pipe')
  await click(page, '.modal__x')

  // ppc
  await click(page, '.jobscreen__pill')
  await page.waitForTimeout(250)
  await shot('ppc')
  await click(page, '.jobscreen__back') // -> create
  await page.waitForTimeout(120)
  await click(page, '.jobscreen__back') // -> home
  await page.waitForTimeout(120)

  // overview
  await click(page, '.admin__stats')
  await page.waitForTimeout(250)
  await shot('overview')
  await click(page, '.overview__back')
  await page.waitForTimeout(120)

  // departments
  await page.locator('.navrow').nth(2).click({ force: true })
  await page.waitForTimeout(250)
  await shot('departments')
  await click(page, '.screen__back')
  await page.waitForTimeout(120)

  // maintenance
  await page.locator('.navrow').nth(3).click({ force: true })
  await page.waitForTimeout(250)
  await shot('maintenance')

  console.log(`${name}: done`)
  await ctx.close()
}

await browser.close()
console.log('all done')
