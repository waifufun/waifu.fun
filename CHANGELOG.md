# Changelog

## v3.0.0

- add the v3 launch wizard for 50% burn launches, with tier selection and launch creation flow.
- show circulating market cap throughout launch and post-launch surfaces instead of FDV-only framing.
- add top navigation for `/launches` and `/portfolio` so discovery and holdings are reachable from the shell.
- require SIWE auth before launch creation so the signer cannot be used by anonymous callers.
- introduce shared empty state, error state, and page shell primitives for cleaner product surfaces.
- improve portfolio on mobile with compact cards and clearer claim actions.
- integrate the real flap V3 portal path for bundle execution instead of mock-only launch routing.
- ship the 50% burn launch primitive: 20% presale, 20% V2 LP, 10% treasury reserve, 3% tax, no buyback loop.
