#!/bin/bash
# Sync cross-language fixtures: canonical source is fixtures/interop (TS), consumed by Swift tests.
cp fixtures/interop/* app/Tests/AnnHubCoreTests/Fixtures/
