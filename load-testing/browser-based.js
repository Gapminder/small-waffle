import { browser } from 'k6/experimental/browser';
import { check } from 'k6';

export const options = {
  scenarios: {
    ui: {
      executor: 'constant-vus',
      vus: 25,
      duration: '30s',
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    checks: ['rate==1.0'],
  },
};

export default async function() {
  const page = await browser.newPage();

  try {

    //const baseUrl = 'https://www.gapminder.org/tools/'
    //const baseUrl = 'http://static.gapminderdev.org/only-ddfcsv/'
    const baseUrl = 'http://static.gapminderdev.org/small-waffle/'
    // const baseUrl = 'http://static.gapminderdev.org/big-waffle/'
    //const query = '#$ui$chart$inpercent:true;;&model$markers$pyramid$data$space@=geo&=year&=age&=gender;&filter$dimensions$geo$/$or@$geo$/$in@=world&=chn&=rus;;;;;;;;&encoding$side$data$constant:null&concept=gender;;;;;;&chart-type=popbyage&url=v2';
    const query = '#$model$markers$bubble$data$space@=geo&=gender&=time;&filter$dimensions$geo:null;;;&encoding$size$data$space@=geo&=time;;;&y$data$concept=literacy_rate_adult&source=sg;&scale$domain:null&zoomed:null&type:null;;&x$data$space@=geo&=time;;;&label$data$source=sg;;&frame$value=2011;;;;;&chart-type=bubbles&url=v2';
    await page.goto(`${baseUrl}${query}`);

    await page.waitForNavigation();

    page.screenshot({ path: 'screenshot-after-nav.png' });

    const selector = '#vzb-bc-bubble-1¬idn-c0-0-0'
    // const selector = '.vzb-bc-stack.vzb-bc-stack-1'

    await page.waitForSelector(selector, { timeout: 20000 });

    page.screenshot({ path: 'screenshot-after-wait.png' });

    const isSelectorVisible = await page.locator(selector).isVisible();

    check(page, {
      'selector is visible': (p) => isSelectorVisible,
    });
  } finally {
    await page.close();
  }
}
