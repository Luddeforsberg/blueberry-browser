# Berry on real websites, 2026-11-06-fetch-prospector

1 runs: 0 Done, 0 Partly, 0 Failed, 0 blocked by the site. Estimated cost $0.08.



## Runs

| Job | Run | Score | Why | Model calls | Tool calls | Peak input tokens | Seconds | Est. cost |
|---|---|---|---|---|---|---|---|---|
| example-prospector | 1 | Unscored |  | 11 | 29 | 33512 | 194 | $0.082 |

## Answers and end states

### example-prospector, run 1

Ability: gallery starter's example. Ended by: finished. End address: none.

End state read from the page: `null`

Answer: I found **one company** that met the criteria using its Swedish legal-entity headcount:

1. **[Tandem Health](https://tandemhealth.ai/)** — Stockholm-based clinical software provider hiring an [Account Executive](https://jobs.ashbyhq.com/tandem-health/1673daaa-e345-4323-a322-c5532c696a83) to sell to healthcare providers. [Allabolag](https://www.allabolag.se/foretag/tandem-health-ab/stockholm/internet-konsulter-operat%C3%B6rer/2KISETLI5YFHL) lists 31 employees for Tandem Health AB.

I couldn’t confirm nine more matches. The employee count above is for the Swedish legal entity; I couldn’t confirm Tandem’s current worldwide headcount.

Tools: `list_tabs {}`, `fetch_page {"url":"https://thehub.io/jobs"}`, `fetch_page {"url":"https://thehub.io/startups"}`, `web_search {"query":"site:jobs.ashbyhq.com Sweden SaaS \"account executive\" Stockholm sa…`, `web_search {"query":"site:career.*.com \"sales\" \"Stockholm\" SaaS account executive Swe…`, `web_search {"query":"site:thehub.io/jobs sales account executive Stockholm SaaS Swedish s…`, `fetch_page {"url":"https://jobs.ashbyhq.com/tandem-health/1673daaa-e345-4323-a322-c5532c6…`, `fetch_page {"url":"https://www.tandemhealth.ai/"}`, `web_search {"query":"\"Tandem Health\" allabolag anställda Sverige AB"}`, `fetch_page {"url":"https://thehub.io/jobs/667acb161a7d5a56adf23c40"}`, `fetch_page {"url":"https://thehub.io/jobs/61421f6957b60b4912bf00ed"}`, `fetch_page {"url":"https://thehub.io/jobs/611bef02e707123e5104451a"}`, `fetch_page {"url":"https://www.allabolag.se/foretag/tandem-health-ab/stockholm/internet-k…`, `fetch_page {"url":"https://www.ycombinator.com/companies/location/sweden"}`, `fetch_page {"url":"https://thehub.io/startups/getaccept"}`, `fetch_page {"url":"https://thehub.io/startups/oneflow"}`, `fetch_page {"url":"https://thehub.io/startups/assently"}`, `fetch_page {"url":"https://thehub.io/startups/planhat"}`, `fetch_page {"url":"https://thehub.io/startups/sana-labs"}`, `fetch_page {"url":"https://thehub.io/startups/seen-this"}`, `web_search {"query":"GetAccept careers sales account executive jobs Sweden sales developm…`, `web_search {"query":"GetAccept AB allabolag antal anställda"}`, `fetch_page {"url":"https://www.getaccept.com/"}`, `fetch_page {"url":"https://careers.getaccept.com/jobs"}`, `fetch_page {"url":"https://jobs.getaccept.com/departments/sales"}`, `fetch_page {"url":"https://jobs.getaccept.com/jobs"}`, `fetch_page {"url":"https://www.allabolag.se/foretag/getaccept-ab/malm%C3%B6/internet-kons…`, `fetch_page {"url":"https://www.allabolag.se/foretag/tandem-health-ab/stockholm/internet-k…`, `fetch_page {"url":"https://jobs.ashbyhq.com/tandem-health/1673daaa-e345-4323-a322-c5532c6…`

