# Asendify Outbound marketing site

Static site for https://outbound.asendify.co (Vercel project `outbound`). Rebuilt from the live deployment on 13 Oct 2026; deploys on push to `main`.

- `vercel.json`: cleanUrls + trailingSlash.
- `/app/`: the dashboard front-end (talks to Supabase project pnokotvssodslxozepxe).
- `/enterprise/`: full-capacity waitlist + £600 refundable deposit (deposit checkout lives at https://playbook.asendify.co/obdeposit).
- `/done-for-you/`: starter package checkout (PayPal via the `dfy` edge function).
