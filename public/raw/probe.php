<?php

declare(strict_types=1);

require_once __DIR__ . '/raw_bridge_lib.php';

raw_bridge_send_json(200, raw_bridge_capabilities());

