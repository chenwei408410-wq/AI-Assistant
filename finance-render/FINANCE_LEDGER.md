# Finance ledger and receipt update

This release extends the existing JSON state without deleting or reseeding records. Existing IDs, source links, opening balances and transaction arrays are preserved. New fields/arrays are additive; no production transaction is created by deployment.

## Money and migration

- Supported currencies are CNY and VND. CNY is stored in integer fen and entered/displayed in yuan with at most two decimals. VND is stored and entered in integer dong. No exchange rate or automatic conversion is configured.
- Accounts, supplier bank accounts, new procurement, reports, payables, actual payments, inventory cost and exports identify currency. Summaries and stock cost layers keep currencies separate. Historical amounts lacking confirmed currency remain visibly unconfirmed; no automatic currency assignment or amount conversion occurs.
- Finance must verify historical documents against original vouchers. The legacy integer-dong protocol can be explicitly confirmed as VND with an audit trail. Historical CNY corrections require reconciliation and separate correction entries rather than reinterpreting old dong values as fen.
- Configure company bank name/number/holder and currency under bank accounts. Cash accounts do not require bank fields. Supplier bank accounts are maintained per supplier and currency, with defaults. Editing bank details never rewrites an approved payment's snapshots.
- Configure a supplier-payment approval flow for each company and currency in base settings. CNY personnel limits are set separately; old VND limits are retained. Existing approval snapshots remain fixed.

## Transactions

Receipt posts actual goods and payables once. Purchase confirmation does not post inventory. Supplier payment applications reserve selected invoice allocations, use configured sequential approvals and do not reduce cash or AP. Finance records actual partial payments with date, actor, unique bank reference and uploaded voucher; only those actual payments post cash and settle their allocated invoices. Optimistic state-version updates and command idempotency prevent duplicate concurrent commits and retries.

PO-linked advances post cash once, are applied to actual goods-receipt payables as goods arrive, and leave only the net residual payable. Pending advances and ordinary AP applications cannot overlap the same procurement. Unused advances can be refunded with same-currency actual bank evidence. Returns/discount adjustments are linked to an original same-currency payable and cannot consume amounts already reserved for payment.

Old supplier-payment applications remain available as history, with cancellation of remaining requests so unsettled allocations can be applied through the new process. New supplier applications use configured flows rather than the old one-approver route. Historical legacy endpoints remain for old records; new purchase-flow records cannot bypass their dedicated receipt commands.

## Receipt checking

Internal shipments automatically appear with original store order, warehouse, product/spec/unit, dispatch/actual/difference quantities and permitted cost details. The store manager uses the existing shipment receipt command; this page creates no duplicate goods, payable or money entry. Multiple currencies are retained as separate cost layers through dispatch, transit, receipt and return.

External/historical receipts explicitly require a warehouse serving the chosen store and authorized to the operator, stable external source reference, goods and actual quantities. They are monetary reconciliation records and do not change stock or supplier AP. Original dispatch amount and actual amount remain separate. Short receipt remains unresolved until an authorized resolution is recorded. Managers and other quantity-only roles do not receive cost fields from the API.

Month closing checks pending receipts/differences, approvals/payments, bank reconciliation, stock processes, unconfirmed currencies and inventory cost for each relevant store and currency before locking.

## Validation

`npm test` runs the existing regression suite plus the finance-ledger integration cases: bank requirements/cash exemption, CNY precision/VND integers, supplier ownership and bank snapshots, sequential approvals, multiple-invoice 10-million payment split 6+4, duplicate/concurrent requests, real voucher validation, advance application/refund, adjustments, mixed-currency cost layers and store returns, external receipts and permissions, month locking, and actual page registration.

No live business transaction is used for testing. Full browser rendering and physical print output still require device acceptance; the local headless Edge process is unavailable in this environment.
