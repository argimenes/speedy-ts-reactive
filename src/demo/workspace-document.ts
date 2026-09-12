import type { ExistingBlockDto } from "../block-tree/types";

// Snapshot of doc2 (the document actually loaded) in speedy-ts/src/components/workspace.tsx.
// Source SHA-256: c7e8f8a11311a342aac3fe82bbeace5cca505dbdd354a3134486516d452bc483
// Keep this literal unchanged; offline-demo substitutions happen on a fresh copy.
export const workspaceDocumentFixture: ExistingBlockDto = {
  "type": "document-block",
  "children": [
    {
      "type": "sticky-tab-row-block",
      "children": [
        {
          "type": "sticky-tab-block",
          "metadata": {
            "text": "Sticky tag #1"
          },
          "children": [
            {
              "type": "standoff-editor-block",
              "text": "Test text for Sticky Tag #1 ..."
            }
          ]
        },
        {
          "type": "sticky-tab-block",
          "metadata": {
            "backgroundColor": "cyan",
            "text": "Sticky tag #2"
          },
          "children": [
            {
              "type": "standoff-editor-block",
              "text": "Test text for Sticky Tag #2 ..."
            }
          ]
        }
      ]
    },
    {
      "type": "document-tab-row-block",
      "children": [
        {
          "type": "document-tab-block",
          "children": [
            {
              "type": "page-block",
              "children": [
                {
                  "type": "standoff-editor-block",
                  "text": "Standoff Property Text Editor",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    }
                  ],
                  "standoffProperties": [
                    {
                      "type": "style/rainbow",
                      "start": 18,
                      "end": 21
                    },
                    {
                      "type": "style/highlighter",
                      "start": 5,
                      "end": 12
                    },
                    {
                      "type": "style/spiky",
                      "start": 15,
                      "end": 28
                    }
                  ],
                  "metadata": {}
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Once upon a midnight dreary ... [left aligned]",
                  "standoffProperties": [
                    {
                      "type": "style/italics",
                      "start": 5,
                      "end": 12
                    },
                    {
                      "type": "style/bold",
                      "start": 7,
                      "end": 14
                    },
                    {
                      "type": "animation/spinner",
                      "start": 10,
                      "end": 12
                    },
                    {
                      "type": "codex/entity-reference",
                      "start": 10,
                      "end": 18,
                      "value": "abd-def-ghi-123"
                    },
                    {
                      "type": "codex/block-reference",
                      "start": 5,
                      "end": 14,
                      "value": "abd-def-ghi-321"
                    },
                    {
                      "type": "codex/time-reference",
                      "start": 15,
                      "end": 22,
                      "value": "abd-def-ghi-432"
                    },
                    {
                      "type": "style/rectangle",
                      "start": 20,
                      "end": 32
                    }
                  ],
                  "blockProperties": [
                    {
                      "type": "block/alignment",
                      "value": "left"
                    }
                  ],
                  "relation": {
                    "leftMargin": {
                      "type": "left-margin-block",
                      "children": [
                        {
                          "type": "standoff-editor-block",
                          "text": "Left margin note 1.",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            },
                            {
                              "type": "block/font/size",
                              "value": "three-quarters"
                            }
                          ]
                        }
                      ]
                    }
                  }
                },
                {
                  "type": "standoff-editor-block",
                  "text": "... while I pondered weak and weary [right aligned]",
                  "standoffProperties": [
                    {
                      "type": "style/italics",
                      "start": 7,
                      "end": 12
                    },
                    {
                      "type": "style/bold",
                      "start": 10,
                      "end": 16
                    }
                  ],
                  "blockProperties": [
                    {
                      "type": "block/alignment",
                      "value": "right"
                    }
                  ],
                  "relation": {
                    "rightMargin": {
                      "type": "right-margin-block",
                      "children": [
                        {
                          "type": "standoff-editor-block",
                          "text": "Right margin note 2a.",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "right"
                            },
                            {
                              "type": "block/font/size",
                              "value": "three-quarters"
                            }
                          ]
                        },
                        {
                          "type": "standoff-editor-block",
                          "text": "Right margin note 2b.",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "right"
                            },
                            {
                              "type": "block/font/size",
                              "value": "three-quarters"
                            }
                          ]
                        }
                      ]
                    }
                  }
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Canvas",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "canvas-block"
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Video",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "youtube-video-block",
                  "metadata": {
                    "url": "https://www.youtube.com/watch?v=fJemjesBMVE"
                  }
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Other Text Editors",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "grid-block",
                  "children": [
                    {
                      "type": "grid-row-block",
                      "children": [
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "48%"
                          },
                          "children": [
                            {
                              "type": "plain-text-block",
                              "text": "... and this is just a plain text block ..."
                            }
                          ]
                        },
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "48%"
                          },
                          "children": [
                            {
                              "type": "code-mirror-block",
                              "text": "// And this is a Javascript function in Code Mirror\n                        const foo = (bar) => {\n                            alert(\"Hello, \" + bar);\n                        }"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Nested Lists",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "indented-list-block",
                  "children": [
                    {
                      "type": "standoff-editor-block",
                      "text": "List item 1",
                      "blockProperties": [
                        {
                          "type": "block/alignment",
                          "value": "left"
                        }
                      ],
                      "children": [
                        {
                          "type": "indented-list-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "List item 1.1",
                              "blockProperties": [
                                {
                                  "type": "block/alignment",
                                  "value": "left"
                                }
                              ]
                            },
                            {
                              "type": "standoff-editor-block",
                              "text": "List item 1.2",
                              "blockProperties": [
                                {
                                  "type": "block/alignment",
                                  "value": "left"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "standoff-editor-block",
                      "text": "List item 2",
                      "blockProperties": [
                        {
                          "type": "block/alignment/left"
                        }
                      ]
                    },
                    {
                      "type": "checkbox-block",
                      "checked": true,
                      "children": [
                        {
                          "type": "standoff-editor-block",
                          "text": "Checkbox list item 1"
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "checkbox-block",
                  "checked": false,
                  "children": [
                    {
                      "type": "standoff-editor-block",
                      "text": "Checkbox list item 2"
                    }
                  ]
                },
                {
                  "type": "standoff-editor-block",
                  "text": "... and back to a regular text block [centre aligned]",
                  "standoffProperties": [
                    {
                      "type": "codex/entity-reference",
                      "start": 5,
                      "end": 18,
                      "value": "abd-def-ghi-123"
                    },
                    {
                      "type": "codex/block-reference",
                      "start": 10,
                      "end": 28,
                      "value": "abd-def-ghi-321"
                    }
                  ],
                  "blockProperties": [
                    {
                      "type": "block/alignment",
                      "value": "center"
                    }
                  ]
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Tabs",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "tab-row-block",
                  "children": [
                    {
                      "type": "tab-block",
                      "metadata": {
                        "name": "A"
                      },
                      "children": [
                        {
                          "type": "standoff-editor-block",
                          "text": "Line 1",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            }
                          ]
                        },
                        {
                          "type": "standoff-editor-block",
                          "text": "Line 2",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "tab-block",
                      "metadata": {
                        "name": "B"
                      },
                      "children": [
                        {
                          "type": "standoff-editor-block",
                          "text": "Line 3",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            }
                          ]
                        },
                        {
                          "type": "standoff-editor-block",
                          "text": "Line 4",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "tab-block",
                      "metadata": {
                        "name": "C"
                      },
                      "children": [
                        {
                          "type": "surface-block",
                          "children": [
                            {
                              "type": "side-block",
                              "metadata": {
                                "active": true
                              },
                              "children": [
                                {
                                  "type": "image-block",
                                  "metadata": {
                                    "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Leonardo_da_Vinci_%281452-1519%29_-_The_Last_Supper_%281495-1498%29.jpg/1024px-Leonardo_da_Vinci_%281452-1519%29_-_The_Last_Supper_%281495-1498%29.jpg"
                                  },
                                  "blockProperties": [
                                    {
                                      "type": "block/draggable"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "side-block",
                              "metadata": {
                                "active": false
                              },
                              "children": [
                                {
                                  "type": "standoff-editor-block",
                                  "text": "Text behind the image ..."
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "standoff-editor-block",
                          "text": "Line 5",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            }
                          ]
                        },
                        {
                          "type": "standoff-editor-block",
                          "text": "Line 6",
                          "blockProperties": [
                            {
                              "type": "block/alignment",
                              "value": "left"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Grids",
                  "blockProperties": [
                    {
                      "type": "block/font/size/h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "grid-block",
                  "children": [
                    {
                      "type": "grid-row-block",
                      "children": [
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "30%"
                          },
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Row 1 - Cell 1"
                            }
                          ]
                        },
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "30%"
                          },
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Row 1 - Cell 2"
                            }
                          ]
                        },
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "30%"
                          },
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Row 1 - Cell 3"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "grid-row-block",
                      "children": [
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "22.5%"
                          },
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Row 2 - Cell 1"
                            }
                          ]
                        },
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "49%"
                          },
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Row 2 - Cell 2"
                            },
                            {
                              "type": "iframe-block",
                              "metadata": {
                                "url": "https://en.wikipedia.org/wiki/Leonardo_da_Vinci"
                              }
                            }
                          ]
                        },
                        {
                          "type": "grid-cell-block",
                          "metadata": {
                            "width": "22.5%"
                          },
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Row 2 - Cell 3"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "standoff-editor-block",
                  "text": "Tables",
                  "blockProperties": [
                    {
                      "type": "block/font/size",
                      "value": "h3"
                    },
                    {
                      "type": "block/margin/top/40px"
                    }
                  ]
                },
                {
                  "type": "table-block",
                  "children": [
                    {
                      "type": "table-row-block",
                      "children": [
                        {
                          "type": "table-cell-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Table Cell 01/01"
                            }
                          ]
                        },
                        {
                          "type": "table-cell-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Table Cell 01/02"
                            }
                          ]
                        },
                        {
                          "type": "table-cell-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Table Cell 01/03"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "table-row-block",
                      "children": [
                        {
                          "type": "table-cell-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Table Cell 02/01"
                            }
                          ]
                        },
                        {
                          "type": "table-cell-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Table Cell 02/02"
                            }
                          ]
                        },
                        {
                          "type": "table-cell-block",
                          "children": [
                            {
                              "type": "standoff-editor-block",
                              "text": "Table Cell 02/03"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          "metadata": {
            "name": "Page 1"
          }
        },
        {
          "type": "document-tab-block",
          "children": [
            {
              "type": "page-block",
              "children": [
                {
                  "type": "standoff-editor-block",
                  "text": "Text on Page 2 ..."
                }
              ],
              "metadata": {
                "name": "Page 2"
              }
            }
          ]
        }
      ]
    }
  ]
};

// Every factory passed to workspace.addBlockBuilders, including types not instantiated by doc2.
export const workspaceBuilderTypes = [
  "book-block",
  "canvas-background-block",
  "canvas-block",
  "checkbox-block",
  "code-mirror-block",
  "container-block",
  "context-menu-block",
  "document-block",
  "document-tab-block",
  "document-tab-row-block",
  "document-window-block",
  "embed-document-block",
  "fixed-size-page-block",
  "grid-block",
  "grid-cell-block",
  "grid-row-block",
  "iframe-block",
  "image-background-block",
  "image-block",
  "indented-list-block",
  "left-margin-block",
  "page-block",
  "plain-text-block",
  "right-margin-block",
  "side-block",
  "standoff-editor-block",
  "sticky-tab-block",
  "sticky-tab-row-block",
  "surface-block",
  "tab-block",
  "tab-row-block",
  "table-block",
  "table-cell-block",
  "table-row-block",
  "video-background-block",
  "window-block",
  "workspace-block",
  "youtube-video-background-block",
  "youtube-video-block"
] as const;

