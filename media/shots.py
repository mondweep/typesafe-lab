import asyncio
from playwright.async_api import async_playwright
U='https://typesafe-lab-276367410975.europe-west2.run.app/'
async def card_of(pg, sel):
    return await pg.evaluate_handle(f"document.querySelector('{sel}').closest('.card')")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1360,'height':900}, device_scale_factor=2, color_scheme='light')
        await pg.goto(U, wait_until='networkidle'); await pg.wait_for_timeout(2000)
        await pg.screenshot(path='shots/01-start-hero.png', clip={'x':0,'y':0,'width':1360,'height':760})
        await pg.add_style_tag(content='header.top{position:static !important}')
        await (await pg.query_selector('#headline')).screenshot(path='shots/02-headline-findings.png')
        # tickets: pick t260 (Jev recorded wrong, live right, typesafe zero wrong)
        await pg.click('nav.tabs button[data-page=tickets]'); await pg.wait_for_timeout(500)
        await pg.click('.ticket-item[data-id="t260"]'); await pg.wait_for_timeout(9000)
        await (await pg.query_selector('#tDetail')).screenshot(path='shots/03-ticket-explorer.png')
        # experiments
        await pg.click('nav.tabs button[data-page=experiments]'); await pg.wait_for_timeout(500)
        await pg.click('#e2run'); await pg.wait_for_timeout(20000)
        await (await card_of(pg, '#e2out')).screenshot(path='shots/04-out-of-scope.png')
        await pg.click('#e6a'); await pg.wait_for_timeout(6000)
        await (await card_of(pg, '#e6out')).screenshot(path='shots/05-reads-the-question.png')
        await pg.click('#e6b'); await pg.wait_for_timeout(6000)
        await (await card_of(pg, '#e6out')).screenshot(path='shots/06-negation.png')
        await (await card_of(pg, '#e4out')).screenshot(path='shots/07-calibration.png')
        # bench
        await pg.click('nav.tabs button[data-page=bench]'); await pg.wait_for_timeout(1500)
        await (await pg.query_selector('#bTable')).screenshot(path='shots/08-fresh-benchmark.png')
        await (await pg.query_selector('#bTags')).screenshot(path='shots/09-by-difficulty.png')
        # cascade
        await pg.click('nav.tabs button[data-page=cascade]'); await pg.wait_for_timeout(1500)
        await (await pg.query_selector('#page-cascade .card')).screenshot(path='shots/10-cascade-diagram.png')
        await pg.click('#cFrontier tr:nth-child(6) .chip'); await pg.wait_for_timeout(500)
        await (await pg.query_selector('#cGrid')).screenshot(path='shots/11-cascade-tuner.png')
        await (await pg.query_selector('#cFrontier')).screenshot(path='shots/12-cascade-frontier.png')
        await pg.click('#cRun'); await pg.wait_for_timeout(15000)
        await (await card_of(pg, '#cOut')).screenshot(path='shots/13-cascade-try.png')
        # verdict
        await pg.click('nav.tabs button[data-page=verdict]'); await pg.wait_for_timeout(500)
        await (await pg.query_selector('#page-verdict .table-wrap')).screenshot(path='shots/14-verdict.png')
        await b.close()
asyncio.run(main())
