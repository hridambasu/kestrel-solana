// AUTO-GENERATED from target/idl/kestrel.json by scripts/gen-types.mjs
export const IDL = {
  "address": "\\\"BMM1yXCNsQMthdy6Q5xDZy6Lm26xrGtUqgo5dS6AKKx4\\",
  "metadata": {
    "name": "kestrel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Kestrel: Solana lending with permissioned RWA collateral, eMode and curated earn vaults"
  },
  "instructions": [
    {
      "name": "init_market",
      "discriminator": [
        33,
        253,
        15,
        116,
        89,
        25,
        127,
        236
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "signer": true
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "compliance_authority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "update_market",
      "discriminator": [
        153,
        39,
        2,
        197,
        179,
        50,
        199,
        217
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "update",
          "type": {
            "defined": {
              "name": "kestrel::instructions::admin_ix::MarketUpdate"
            }
          }
        }
      ]
    },
    {
      "name": "init_reserve",
      "discriminator": [
        138,
        245,
        71,
        225,
        153,
        4,
        3,
        43
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market"
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "liquidity_mint"
        },
        {
          "name": "reserve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "liquidity_mint"
              }
            ]
          }
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  113,
                  117,
                  105,
                  100,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "reserve"
              }
            ]
          }
        },
        {
          "name": "collateral_mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  107,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "reserve"
              }
            ]
          }
        },
        {
          "name": "collateral_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  107,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "reserve"
              }
            ]
          }
        },
        {
          "name": "oracle"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "kestrel::state::reserve_state::ReserveConfig"
            }
          }
        }
      ]
    },
    {
      "name": "update_reserve_config",
      "discriminator": [
        61,
        148,
        100,
        70,
        143,
        107,
        17,
        13
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "reserve",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "kestrel::state::reserve_state::ReserveConfig"
            }
          }
        }
      ]
    },
    {
      "name": "issue_credential",
      "discriminator": [
        255,
        193,
        171,
        224,
        68,
        171,
        194,
        87
      ],
      "accounts": [
        {
          "name": "compliance_authority",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market"
        },
        {
          "name": "credential",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "arg",
                "path": "holder"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "holder",
          "type": "pubkey"
        },
        {
          "name": "expires_at",
          "type": "i64"
        }
      ]
    },
    {
      "name": "revoke_credential",
      "discriminator": [
        38,
        123,
        95,
        95,
        223,
        158,
        169,
        87
      ],
      "accounts": [
        {
          "name": "compliance_authority",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "relations": [
            "credential"
          ]
        },
        {
          "name": "credential",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "init_mock_price",
      "discriminator": [
        86,
        109,
        119,
        111,
        238,
        219,
        127,
        182
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "price",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "i64"
        },
        {
          "name": "conf",
          "type": "u64"
        },
        {
          "name": "expo",
          "type": "i32"
        },
        {
          "name": "ema",
          "type": "i64"
        }
      ]
    },
    {
      "name": "set_mock_price",
      "discriminator": [
        161,
        22,
        71,
        90,
        159,
        254,
        26,
        48
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "price"
          ]
        },
        {
          "name": "price",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "i64"
        },
        {
          "name": "conf",
          "type": "u64"
        },
        {
          "name": "expo",
          "type": "i32"
        },
        {
          "name": "ema",
          "type": "i64"
        }
      ]
    },
    {
      "name": "refresh_reserve",
      "discriminator": [
        2,
        218,
        138,
        235,
        79,
        201,
        25,
        102
      ],
      "accounts": [
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "oracle",
          "relations": [
            "reserve"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "deposit_reserve_liquidity",
      "discriminator": [
        169,
        201,
        30,
        126,
        6,
        205,
        102,
        68
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "collateral_mint",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "user_liquidity",
          "writable": true
        },
        {
          "name": "user_collateral",
          "writable": true
        },
        {
          "name": "credential",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeem_reserve_collateral",
      "discriminator": [
        234,
        117,
        181,
        125,
        185,
        142,
        220,
        29
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "collateral_mint",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "user_liquidity",
          "writable": true
        },
        {
          "name": "user_collateral",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "ktokens",
          "type": "u64"
        }
      ]
    },
    {
      "name": "init_obligation",
      "discriminator": [
        251,
        10,
        231,
        76,
        27,
        11,
        159,
        96
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "obligation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  98,
                  108,
                  105,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "elevation_group",
          "type": "u8"
        }
      ]
    },
    {
      "name": "refresh_obligation",
      "discriminator": [
        33,
        132,
        147,
        228,
        151,
        192,
        72,
        89
      ],
      "accounts": [
        {
          "name": "market",
          "relations": [
            "obligation"
          ]
        },
        {
          "name": "obligation",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "set_elevation_group",
      "discriminator": [
        5,
        57,
        51,
        21,
        111,
        229,
        71,
        165
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "obligation"
          ]
        },
        {
          "name": "market",
          "relations": [
            "obligation"
          ]
        },
        {
          "name": "obligation",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "group",
          "type": "u8"
        }
      ]
    },
    {
      "name": "deposit_obligation_collateral",
      "discriminator": [
        108,
        209,
        4,
        72,
        21,
        22,
        118,
        133
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "obligation"
          ]
        },
        {
          "name": "market",
          "relations": [
            "obligation",
            "reserve"
          ]
        },
        {
          "name": "obligation",
          "writable": true
        },
        {
          "name": "reserve"
        },
        {
          "name": "collateral_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "user_collateral",
          "writable": true
        },
        {
          "name": "credential",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "ktokens",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw_obligation_collateral",
      "discriminator": [
        37,
        116,
        205,
        103,
        243,
        192,
        92,
        198
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "obligation"
          ]
        },
        {
          "name": "market",
          "relations": [
            "obligation",
            "reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "obligation",
          "writable": true
        },
        {
          "name": "reserve"
        },
        {
          "name": "collateral_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "user_collateral",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "ktokens",
          "type": "u64"
        }
      ]
    },
    {
      "name": "borrow_obligation_liquidity",
      "discriminator": [
        121,
        127,
        18,
        204,
        73,
        245,
        225,
        65
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "obligation"
          ]
        },
        {
          "name": "market",
          "relations": [
            "obligation",
            "reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "obligation",
          "writable": true
        },
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "user_liquidity",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "repay_obligation_liquidity",
      "discriminator": [
        145,
        178,
        13,
        225,
        76,
        240,
        147,
        72
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "obligation",
            "reserve"
          ]
        },
        {
          "name": "obligation",
          "writable": true
        },
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "payer_liquidity",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "liquidate_obligation",
      "discriminator": [
        174,
        105,
        88,
        231,
        44,
        70,
        232,
        134
      ],
      "accounts": [
        {
          "name": "liquidator",
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "obligation",
            "repay_reserve",
            "withdraw_reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "obligation",
          "writable": true
        },
        {
          "name": "repay_reserve",
          "docs": [
            "Reserve of the debt being repaid."
          ],
          "writable": true
        },
        {
          "name": "repay_liquidity_vault",
          "writable": true
        },
        {
          "name": "withdraw_reserve",
          "docs": [
            "Reserve of the collateral being seized. May equal `repay_reserve`'s market but must be a different account."
          ]
        },
        {
          "name": "withdraw_collateral_vault",
          "writable": true
        },
        {
          "name": "liquidator_liquidity",
          "writable": true
        },
        {
          "name": "liquidator_collateral",
          "writable": true
        },
        {
          "name": "credential",
          "docs": [
            "Required when the seized collateral is a permissioned (RWA) asset."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "liquidator"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "max_repay_amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "socialize_loss",
      "discriminator": [
        245,
        75,
        91,
        0,
        236,
        97,
        19,
        3
      ],
      "accounts": [
        {
          "name": "market",
          "relations": [
            "obligation",
            "reserve"
          ]
        },
        {
          "name": "obligation",
          "writable": true
        },
        {
          "name": "reserve",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "init_vault",
      "discriminator": [
        77,
        79,
        85,
        150,
        33,
        217,
        52,
        106
      ],
      "accounts": [
        {
          "name": "curator",
          "writable": true,
          "signer": true
        },
        {
          "name": "liquidity_mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "curator"
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "idle_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "shares_mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "fee_receiver",
          "docs": [
            "Token account (shares mint) receiving performance-fee shares."
          ]
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "performance_fee_bps",
          "type": "u16"
        },
        {
          "name": "allocator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "set_allocation",
      "discriminator": [
        119,
        81,
        22,
        4,
        114,
        187,
        23,
        145
      ],
      "accounts": [
        {
          "name": "curator",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "reserve"
        },
        {
          "name": "collateral_mint"
        },
        {
          "name": "vault_ktokens",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "reserve"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "cap",
          "type": "u64"
        }
      ]
    },
    {
      "name": "vault_deposit",
      "discriminator": [
        231,
        150,
        41,
        113,
        180,
        104,
        162,
        120
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "idle_vault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "shares_mint",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "user_liquidity",
          "writable": true
        },
        {
          "name": "user_shares",
          "writable": true
        },
        {
          "name": "fee_receiver",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "vault_withdraw",
      "discriminator": [
        98,
        28,
        187,
        98,
        87,
        69,
        46,
        64
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "idle_vault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "shares_mint",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "user_liquidity",
          "writable": true
        },
        {
          "name": "user_shares",
          "writable": true
        },
        {
          "name": "fee_receiver",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "vault_invest",
      "discriminator": [
        55,
        252,
        44,
        208,
        168,
        145,
        45,
        220
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "idle_vault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "market",
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "collateral_mint",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "vault_ktokens",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "reserve"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "vault_divest",
      "discriminator": [
        178,
        4,
        87,
        3,
        144,
        197,
        56,
        221
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "idle_vault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "market",
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "market_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reserve",
          "writable": true
        },
        {
          "name": "liquidity_vault",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "collateral_mint",
          "writable": true,
          "relations": [
            "reserve"
          ]
        },
        {
          "name": "vault_ktokens",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "reserve"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "ktokens",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "kestrel::state::market_state::Credential",
      "discriminator": [
        145,
        44,
        68,
        220,
        67,
        46,
        100,
        135
      ]
    },
    {
      "name": "kestrel::state::market_state::Market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "kestrel::state::market_state::MockPrice",
      "discriminator": [
        2,
        6,
        235,
        132,
        88,
        250,
        211,
        139
      ]
    },
    {
      "name": "kestrel::state::obligation_state::Obligation",
      "discriminator": [
        168,
        206,
        141,
        106,
        88,
        76,
        172,
        167
      ]
    },
    {
      "name": "kestrel::state::reserve_state::Reserve",
      "discriminator": [
        43,
        242,
        204,
        202,
        26,
        247,
        59,
        127
      ]
    },
    {
      "name": "kestrel::state::vault_state::EarnVault",
      "discriminator": [
        50,
        118,
        31,
        24,
        200,
        163,
        174,
        156
      ]
    }
  ],
  "types": [
    {
      "name": "kestrel::instructions::admin_ix::MarketUpdate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "close_factor_bps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "compliance_authority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "elevation_group",
            "type": {
              "option": {
                "defined": {
                  "name": "kestrel::state::market_state::ElevationGroup"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::Borrowed",
      "type": {
        "fields": [
          {
            "name": "obligation",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::CollateralDeposited",
      "type": {
        "fields": [
          {
            "name": "obligation",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "ktokens",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::CollateralWithdrawn",
      "type": {
        "fields": [
          {
            "name": "obligation",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "ktokens",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::Liquidated",
      "type": {
        "fields": [
          {
            "name": "obligation",
            "type": "pubkey"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "repay_reserve",
            "type": "pubkey"
          },
          {
            "name": "withdraw_reserve",
            "type": "pubkey"
          },
          {
            "name": "repay_amount",
            "type": "u64"
          },
          {
            "name": "seized_ktokens",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::LiquidityDeposited",
      "type": {
        "fields": [
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "ktokens",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::LiquidityRedeemed",
      "type": {
        "fields": [
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "ktokens",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::LossSocialized",
      "type": {
        "fields": [
          {
            "name": "obligation",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "debt_wads",
            "type": "u128"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::lending_ix::Repaid",
      "type": {
        "fields": [
          {
            "name": "obligation",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::vault_ix::AllocationSet",
      "type": {
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "cap",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::vault_ix::VaultDeposited",
      "type": {
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::vault_ix::VaultReallocated",
      "type": {
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "supplied",
            "type": "u64"
          },
          {
            "name": "withdrawn",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::instructions::vault_ix::VaultWithdrawn",
      "type": {
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "kestrel::state::market_state::Credential",
      "docs": [
        "Proof that `holder` passed KYC/KYB for this market. Required to deposit into,",
        "or receive (via liquidation), permissioned reserves such as tokenized",
        "T-bills or private credit, whose transfer rules restrict who may hold them."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "expires_at",
            "type": "i64"
          },
          {
            "name": "revoked",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::market_state::ElevationGroup",
      "docs": [
        "Elevation group (\"eMode\"): obligations that only hold correlated assets",
        "(e.g. SOL + liquid-staked SOL, or USDC + T-bill tokens) get higher LTVs."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "docs": [
              "0 = unused slot. Group ids are 1..=MAX_ELEVATION_GROUPS."
            ],
            "type": "u8"
          },
          {
            "name": "ltv_bps",
            "type": "u16"
          },
          {
            "name": "liquidation_threshold_bps",
            "type": "u16"
          },
          {
            "name": "liquidation_bonus_bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::market_state::Market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "compliance_authority",
            "docs": [
              "Issues / revokes credentials for permissioned (RWA) reserves."
            ],
            "type": "pubkey"
          },
          {
            "name": "close_factor_bps",
            "docs": [
              "Max share of a single borrow that can be repaid per liquidation."
            ],
            "type": "u16"
          },
          {
            "name": "dust_debt_wads",
            "docs": [
              "Debt below this USD value (WAD) can be fully liquidated in one go."
            ],
            "type": "u128"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "elevation_groups",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "kestrel::state::market_state::ElevationGroup"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::market_state::MockPrice",
      "docs": [
        "Program-owned price feed for localnet and tests (feature `mock-oracle`).",
        "Mirrors the fields the program reads from Pyth `PriceUpdateV2`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "expo",
            "type": "i32"
          },
          {
            "name": "ema_price",
            "type": "i64"
          },
          {
            "name": "publish_time",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::obligation_state::Obligation",
      "docs": [
        "A user's cross-collateral account in one market."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "elevation_group",
            "type": "u8"
          },
          {
            "name": "deposits",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "kestrel::state::obligation_state::ObligationCollateral"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "borrows",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "kestrel::state::obligation_state::ObligationLiquidity"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "deposited_value_wads",
            "docs": [
              "Sum of collateral values at price_lower."
            ],
            "type": "u128"
          },
          {
            "name": "borrow_factor_adjusted_debt_wads",
            "docs": [
              "Sum of debt values at price_upper, times borrow factor."
            ],
            "type": "u128"
          },
          {
            "name": "allowed_borrow_value_wads",
            "type": "u128"
          },
          {
            "name": "unhealthy_borrow_value_wads",
            "type": "u128"
          },
          {
            "name": "last_update_ts",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::obligation_state::ObligationCollateral",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "deposited_amount",
            "docs": [
              "kTokens posted."
            ],
            "type": "u64"
          },
          {
            "name": "market_value_wads",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::obligation_state::ObligationLiquidity",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "borrowed_amount_wads",
            "docs": [
              "Debt in liquidity base units * WAD, as of `cumulative_borrow_rate_wads`."
            ],
            "type": "u128"
          },
          {
            "name": "cumulative_borrow_rate_wads",
            "type": "u128"
          },
          {
            "name": "market_value_wads",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::reserve_state::Reserve",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "liquidity_mint",
            "type": "pubkey"
          },
          {
            "name": "liquidity_vault",
            "type": "pubkey"
          },
          {
            "name": "collateral_mint",
            "docs": [
              "kToken: receipt token for supplied liquidity; also what obligations post as collateral."
            ],
            "type": "pubkey"
          },
          {
            "name": "collateral_vault",
            "docs": [
              "Token account holding kTokens posted as collateral by all obligations."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "available_amount",
            "docs": [
              "Liquidity sitting in the vault (tracked, not read from balance: donations can't move the exchange rate)."
            ],
            "type": "u64"
          },
          {
            "name": "borrowed_amount_wads",
            "type": "u128"
          },
          {
            "name": "cumulative_borrow_rate_wads",
            "type": "u128"
          },
          {
            "name": "accumulated_protocol_fees_wads",
            "type": "u128"
          },
          {
            "name": "collateral_mint_supply",
            "type": "u64"
          },
          {
            "name": "price_lower_wads",
            "type": "u128"
          },
          {
            "name": "price_upper_wads",
            "type": "u128"
          },
          {
            "name": "last_update_ts",
            "type": "i64"
          },
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "kestrel::state::reserve_state::ReserveConfig"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vault_bump",
            "type": "u8"
          },
          {
            "name": "collateral_mint_bump",
            "type": "u8"
          },
          {
            "name": "collateral_vault_bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::reserve_state::ReserveConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ltv_bps",
            "docs": [
              "Max borrow value as share of this collateral's value."
            ],
            "type": "u16"
          },
          {
            "name": "liquidation_threshold_bps",
            "docs": [
              "Collateral share at which the obligation becomes liquidatable."
            ],
            "type": "u16"
          },
          {
            "name": "liquidation_bonus_bps",
            "docs": [
              "Extra collateral paid to liquidators on repaid debt."
            ],
            "type": "u16"
          },
          {
            "name": "borrow_factor_bps",
            "docs": [
              "Risk weight on debt in this asset (10_000 = 1x). Volatile borrow assets",
              "consume more borrowing power per dollar."
            ],
            "type": "u16"
          },
          {
            "name": "protocol_fee_bps",
            "docs": [
              "Share of interest kept by the protocol."
            ],
            "type": "u16"
          },
          {
            "name": "min_rate_bps",
            "type": "u16"
          },
          {
            "name": "optimal_util_bps",
            "type": "u16"
          },
          {
            "name": "optimal_rate_bps",
            "type": "u16"
          },
          {
            "name": "max_rate_bps",
            "type": "u16"
          },
          {
            "name": "deposit_limit",
            "docs": [
              "Max total liquidity (base units) suppliers can deposit."
            ],
            "type": "u64"
          },
          {
            "name": "borrow_limit",
            "docs": [
              "Max total borrows (base units)."
            ],
            "type": "u64"
          },
          {
            "name": "borrow_enabled",
            "type": "bool"
          },
          {
            "name": "permissioned",
            "docs": [
              "RWA mode: depositing and receiving this asset needs a Credential."
            ],
            "type": "bool"
          },
          {
            "name": "elevation_group",
            "docs": [
              "0 = none. Obligations in an elevation group may only use reserves in that group."
            ],
            "type": "u8"
          },
          {
            "name": "max_price_age_s",
            "type": "u32"
          },
          {
            "name": "max_conf_bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::vault_state::EarnVault",
      "docs": [
        "Curated earn vault: depositors hold vault shares; the curator whitelists",
        "reserves (possibly across markets) and caps each one; the allocator moves",
        "idle liquidity in and out. The vault only ever *supplies* \u2014 it never borrows."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "curator",
            "type": "pubkey"
          },
          {
            "name": "allocator",
            "type": "pubkey"
          },
          {
            "name": "liquidity_mint",
            "type": "pubkey"
          },
          {
            "name": "idle_vault",
            "type": "pubkey"
          },
          {
            "name": "shares_mint",
            "type": "pubkey"
          },
          {
            "name": "fee_receiver",
            "type": "pubkey"
          },
          {
            "name": "performance_fee_bps",
            "type": "u16"
          },
          {
            "name": "idle_amount",
            "type": "u64"
          },
          {
            "name": "shares_supply",
            "type": "u64"
          },
          {
            "name": "last_aum",
            "docs": [
              "AUM at the last fee crystallisation (high-water mark for performance fees)."
            ],
            "type": "u64"
          },
          {
            "name": "allocations",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "kestrel::state::vault_state::VaultAllocation"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "idle_bump",
            "type": "u8"
          },
          {
            "name": "shares_bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "kestrel::state::vault_state::VaultAllocation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "ktoken_account",
            "docs": [
              "Vault-owned token account holding this reserve's kTokens."
            ],
            "type": "pubkey"
          },
          {
            "name": "ktokens",
            "docs": [
              "kTokens held (tracked; donations are ignored)."
            ],
            "type": "u64"
          },
          {
            "name": "cap",
            "docs": [
              "Max liquidity (base units) the vault may supply to this reserve."
            ],
            "type": "u64"
          }
        ]
      }
    }
  ],
  "events": [
    {
      "discriminator": [
        225,
        182,
        241,
        78,
        34,
        145,
        253,
        230
      ],
      "name": "kestrel::instructions::lending_ix::Borrowed"
    },
    {
      "discriminator": [
        244,
        62,
        77,
        11,
        135,
        112,
        61,
        96
      ],
      "name": "kestrel::instructions::lending_ix::CollateralDeposited"
    },
    {
      "discriminator": [
        51,
        224,
        133,
        106,
        74,
        173,
        72,
        82
      ],
      "name": "kestrel::instructions::lending_ix::CollateralWithdrawn"
    },
    {
      "discriminator": [
        231,
        57,
        55,
        75,
        0,
        170,
        246,
        68
      ],
      "name": "kestrel::instructions::lending_ix::Liquidated"
    },
    {
      "discriminator": [
        218,
        155,
        74,
        193,
        59,
        66,
        94,
        122
      ],
      "name": "kestrel::instructions::lending_ix::LiquidityDeposited"
    },
    {
      "discriminator": [
        78,
        81,
        213,
        176,
        1,
        84,
        138,
        65
      ],
      "name": "kestrel::instructions::lending_ix::LiquidityRedeemed"
    },
    {
      "discriminator": [
        60,
        250,
        234,
        80,
        52,
        189,
        72,
        147
      ],
      "name": "kestrel::instructions::lending_ix::LossSocialized"
    },
    {
      "discriminator": [
        38,
        248,
        231,
        7,
        150,
        164,
        172,
        23
      ],
      "name": "kestrel::instructions::lending_ix::Repaid"
    },
    {
      "discriminator": [
        32,
        45,
        253,
        55,
        65,
        85,
        102,
        218
      ],
      "name": "kestrel::instructions::vault_ix::AllocationSet"
    },
    {
      "discriminator": [
        59,
        62,
        43,
        200,
        220,
        104,
        100,
        67
      ],
      "name": "kestrel::instructions::vault_ix::VaultDeposited"
    },
    {
      "discriminator": [
        17,
        52,
        102,
        102,
        68,
        79,
        201,
        146
      ],
      "name": "kestrel::instructions::vault_ix::VaultReallocated"
    },
    {
      "discriminator": [
        238,
        9,
        219,
        172,
        188,
        77,
        72,
        104
      ],
      "name": "kestrel::instructions::vault_ix::VaultWithdrawn"
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "MathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6001,
      "name": "ReserveStale",
      "msg": "Reserve must be refreshed in this transaction"
    },
    {
      "code": 6002,
      "name": "ObligationStale",
      "msg": "Obligation must be refreshed in this transaction"
    },
    {
      "code": 6003,
      "name": "InvalidOracle",
      "msg": "Oracle account is not a supported price feed"
    },
    {
      "code": 6004,
      "name": "OracleMismatch",
      "msg": "Oracle account does not match reserve config"
    },
    {
      "code": 6005,
      "name": "StalePrice",
      "msg": "Oracle price is stale"
    },
    {
      "code": 6006,
      "name": "PriceConfidenceTooWide",
      "msg": "Oracle confidence interval too wide"
    },
    {
      "code": 6007,
      "name": "InvalidPrice",
      "msg": "Oracle price is non-positive"
    },
    {
      "code": 6008,
      "name": "InvalidConfig",
      "msg": "Invalid reserve configuration"
    },
    {
      "code": 6009,
      "name": "DepositLimitExceeded",
      "msg": "Deposit would exceed reserve deposit limit"
    },
    {
      "code": 6010,
      "name": "BorrowLimitExceeded",
      "msg": "Borrow would exceed reserve borrow limit"
    },
    {
      "code": 6011,
      "name": "BorrowDisabled",
      "msg": "Borrowing is disabled for this reserve"
    },
    {
      "code": 6012,
      "name": "InsufficientLiquidity",
      "msg": "Not enough liquidity in reserve"
    },
    {
      "code": 6013,
      "name": "BorrowTooLarge",
      "msg": "Borrow would exceed allowed borrow value"
    },
    {
      "code": 6014,
      "name": "WithdrawTooLarge",
      "msg": "Withdraw would leave obligation unhealthy"
    },
    {
      "code": 6015,
      "name": "ObligationHealthy",
      "msg": "Obligation is healthy and cannot be liquidated"
    },
    {
      "code": 6016,
      "name": "ObligationDepositsFull",
      "msg": "Obligation has no free deposit slot"
    },
    {
      "code": 6017,
      "name": "ObligationBorrowsFull",
      "msg": "Obligation has no free borrow slot"
    },
    {
      "code": 6018,
      "name": "ReserveNotInObligation",
      "msg": "Reserve not found in obligation"
    },
    {
      "code": 6019,
      "name": "InvalidRemainingAccounts",
      "msg": "Remaining accounts do not match obligation reserves"
    },
    {
      "code": 6020,
      "name": "ZeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6021,
      "name": "CredentialRequired",
      "msg": "Reserve is permissioned: a valid credential is required"
    },
    {
      "code": 6022,
      "name": "CredentialExpired",
      "msg": "Credential has expired"
    },
    {
      "code": 6023,
      "name": "ElevationGroupMismatch",
      "msg": "Reserve not allowed in the obligation's elevation group"
    },
    {
      "code": 6024,
      "name": "InvalidElevationGroup",
      "msg": "Elevation group does not exist"
    },
    {
      "code": 6025,
      "name": "LiquidationTooSmall",
      "msg": "Liquidation repay amount too small"
    },
    {
      "code": 6026,
      "name": "ObligationHasCollateral",
      "msg": "Obligation still has collateral; loss cannot be socialized"
    },
    {
      "code": 6027,
      "name": "MarketPaused",
      "msg": "Market is paused"
    },
    {
      "code": 6028,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6029,
      "name": "InvalidAllocation",
      "msg": "Vault allocation slot not found or full"
    },
    {
      "code": 6030,
      "name": "AllocationCapExceeded",
      "msg": "Vault allocation cap exceeded"
    },
    {
      "code": 6031,
      "name": "InsufficientIdle",
      "msg": "Vault does not have enough idle liquidity"
    },
    {
      "code": 6032,
      "name": "FeeTooHigh",
      "msg": "Fee too high"
    },
    {
      "code": 6033,
      "name": "MintMismatch",
      "msg": "Token mint mismatch"
    }
  ]
} as const;
export type Kestrel = typeof IDL;
