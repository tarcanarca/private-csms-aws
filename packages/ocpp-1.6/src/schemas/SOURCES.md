# Vendored OCPP 1.6 JSON schemas

Draft-04 JSON Schemas for the Open Charge Alliance OCPP 1.6 (Edition 2) JSON binding.
Do not edit by hand. Retrieved 2026-11-19 from the schema set republished at
https://raw.githubusercontent.com/mobilityhouse/ocpp/master/ocpp/v16/schemas/ (a copy of the OCA files).
Cross-reference: https://ocpp-spec.org/schemas/v1.6/ ; authoritative source: the OCA download
https://openchargealliance.org/download-ocpp/ (requires the signed OCA package).

TODO before production: diff these four files against the OCA package.

| File | SHA-256 |
|---|---|
| BootNotification.json | 57cedc8c00715439587b6ae71efc4ddc9904048c83d152e7f0f1f60283bc525b |
| BootNotificationResponse.json | abafc062cce4f3d2bad0c7c92ca72c13d69d8f0a7c7f549634848b8cc21d46f9 |
| Heartbeat.json | 83c5b67c13328fcafe90d3ca024e50f82d035f6ef481d917074cce728dfe459f |
| HeartbeatResponse.json | f4df4789381766869c110245854bc47173973684352ed67382ffc9ded018bc21 |

`tests/protocol/schema-provenance.test.ts` fails if a hash changes.
