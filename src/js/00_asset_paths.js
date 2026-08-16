"use strict";

/** Development mode: preserve external relative asset URLs. */
window.s7ResolveEmbeddedAsset = window.s7ResolveEmbeddedAsset || function(path) { return String(path || ""); };
