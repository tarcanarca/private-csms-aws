-- Phase 1: station inventory and boot log. Forward-only, additive.
CREATE SCHEMA IF NOT EXISTS station;

CREATE TABLE station.station (
    station_id          text PRIMARY KEY
                        CHECK (station_id ~ '^[A-Za-z0-9._:-]{1,48}$'),
    registration_status text NOT NULL DEFAULT 'Accepted'
                        CHECK (registration_status IN ('Accepted', 'Pending', 'Rejected')),
    -- scrypt hash of the OCPP Basic-auth password. NULL means the station cannot authenticate.
    credential_hash     text,
    protocol_version    text CHECK (protocol_version IN ('1.6', '2.0.1')),
    vendor              text,
    model               text,
    serial_number       text,
    firmware_version    text,
    modem_iccid         text,
    modem_imsi          text,
    last_boot_at        timestamptz,
    boot_count          integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Append-only evidence of every boot decision. The unique key makes the boot
-- endpoint idempotent: a retried request (same connection + OCPP message id)
-- returns the stored decision instead of applying the boot twice.
CREATE TABLE station.boot_event (
    id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id               text NOT NULL REFERENCES station.station (station_id),
    connection_id            uuid NOT NULL,
    ocpp_message_id          text NOT NULL,
    ocpp_version             text NOT NULL,
    received_at              timestamptz NOT NULL,
    recorded_at              timestamptz NOT NULL DEFAULT now(),
    decision_status          text NOT NULL,
    decision_interval_seconds integer NOT NULL,
    decision_server_time     timestamptz NOT NULL,
    protocol_payload         jsonb NOT NULL,
    CONSTRAINT boot_event_idempotency UNIQUE (station_id, connection_id, ocpp_message_id)
);

CREATE INDEX boot_event_station_recorded ON station.boot_event (station_id, recorded_at DESC);
