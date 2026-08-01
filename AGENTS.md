<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## Read the project skill before changing anything

`.claude/skills/luy-manager-project/SKILL.md` is the house rules for this
repository: the layer boundaries, the migration and RLS workflow, the server
action shape, the design tokens, the CI gates, and the traps that have already
caused bugs here. Its `references/codebase-map.md` answers "where does this go".

Two more skills cover the parts where a mistake is expensive and invisible:

| Skill | Read when |
| --- | --- |
| `luy-manager-money` | Touching any amount, currency, split, or exchange rate |
| `luy-manager-telegram` | Touching the bot, or any webhook that writes without a session |

The short version, if you read nothing else:

- Money is integer minor units paired with a currency. KHR has **zero** decimals.
- Middleware is `src/proxy.ts` and exports `proxy`. `src/middleware.ts` is ignored.
- A webhook has no session, so Row Level Security is absent, not weakened. Filter
  every query by `user_id` by hand.
- Never edit an applied migration. Add the next numbered file.
- Colours come from the tokens in `src/app/globals.css`, never a hex literal.
- Before pushing: `npm run typecheck && npm run lint && npm test && npm run build`,
  plus the money scanner. Its baseline is 7 findings, 0 high.
- No em dashes or en dashes, anywhere.
