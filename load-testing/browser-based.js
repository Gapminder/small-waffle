import { browser } from 'k6/experimental/browser';
import { check } from 'k6';

export const options = {
  scenarios: {
    ui: {
      executor: 'constant-vus',
      vus: 25,
      duration: '120s',
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

    const toolsPageBaseUrl = 'https://www.gapminder.org/tools/'
    const onlyDdfCsvBaseUrl = 'http://static.gapminderdev.org/only-ddfcsv/'
    const smallWaffleBaseUrl = 'http://static.gapminderdev.org/small-waffle/'
    const smallWaffleNoProxyBaseUrl = 'http://static.gapminderdev.org/small-waffle-noproxy/'
    // const bigWaffleBaseUrl = 'http://static.gapminderdev.org/big-waffle/' // Non-proxied big waffle

    const bubblesTest = {
      'query': '#$model$markers$bubble$data$space@=geo&=gender&=time;&filter$dimensions$geo:null;;;&encoding$size$data$space@=geo&=time;;;&y$data$concept=literacy_rate_adult&source=sg;&scale$domain:null&zoomed:null&type:null;;&x$data$space@=geo&=time;;;&label$data$source=sg;;&frame$value=2011;;;;;&chart-type=bubbles&url=v2',
      'selector': '#vzb-bc-bubble-1¬idn-c0-0-0',
    }
    const agesTest = {
      'query': '#$ui$chart$inpercent:true;;&model$markers$pyramid$data$space@=geo&=year&=age&=gender;&filter$dimensions$geo$/$or@$geo$/$in@=world&=chn&=rus;;;;;;;;&encoding$side$data$constant:null&concept=gender;;;;;;&chart-type=popbyage&url=v2',
      'selector': '.vzb-bc-stack.vzb-bc-stack-1',
    }

    const baseUrl = toolsPageBaseUrl
    const test = agesTest

    await page.goto(`${baseUrl}${test.query}`);

    await page.waitForNavigation();

    page.screenshot({ path: 'screenshot-after-nav.png' });

    const selector = test.selector

    await page.waitForSelector(selector, { timeout: 20000 });

    page.screenshot({ path: 'screenshot-after-wait.png' });

  } finally {
    await page.close();
  }
}
