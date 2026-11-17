# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aasubarkah1-ui/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aasubarkah1-ui/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Token Radar** ranks the protocols that custody real value and have not issued a token yet, by what
their launch could be worth, and hands back a farm plan for each one.

The board covers every protocol on the snapshot's watchlist and adds the pre-token protocols below
the house floor as early finds. Implied value is a stated model, computed from the snapshot's own
figures and no name list:

```
implied = TVL x category_multiple x growth_multiplier x launch_premium x depth_factor
```

- `category_multiple` — what a category's TVL is worth as a token, from a DEX's thin liquidity (0.22)
  to an RWA book carried on the balance sheet (0.45);
- `growth_multiplier` — seven-day TVL growth, clamped to ±50/100 per cent, at weight 0.35;
- `launch_premium` — 1.25 down to 0.90 across three years without a token: the younger the protocol,
  the more a launch is worth;
- `depth_factor` — 0.45 to 1.15 by log TVL, because a deeper market carries a bigger launch.

Every row also carries a risk read (a hard drawdown, a short history, or a small TVL), and the
protocols whose token already trades are kept apart in their own tab, with market cap and the
market-cap-to-TVL ratio, never mixed into the ranking.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ./input/snapshot.json
node serve.ts   # optional: serves out/ so the dashboard opens in a browser
```

## Layout

```
main.ts                 the entrypoint: snapshot in, board.json + data.js + dossier out
lib/model.ts            the model: implied value, risk, confidence, farm plans
dashboard/index.html    the page shell
dashboard/app.css       the radar's palette, spacing and type
dashboard/app.js        the board, the filters, the live tab and the detail view
vendor/makefun-board.ts the kit's dossier library, unchanged
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=pg9n4977&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
