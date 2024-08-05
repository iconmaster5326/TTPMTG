const {
  globalEvents,
  world,
  Player,
  Color,
  Vector,
  Rotator,
  fetch,
} = require("@tabletop-playground/api");
const url = require("url");
const cheerio = require("cheerio");

const SCRYFALL_URL = "https://api.scryfall.com/";
const MTGJSON_URL = "https://mtgjson.com/api/v5/";
const CARD_TEMPLATE = "259D66CE415FF02DA2381FBCDB053E1B";

world.startDebugMode();

const scryfallCacheByID = {},
  scryfallCacheByName = {},
  scryfallCacheBySetCode = {};

world.fetchScryfallDataByID = function (id) {
  let result = scryfallCacheByID[id];
  if (result === undefined) {
    return fetch(SCRYFALL_URL + "cards/" + id)
      .then(function (fetchResponse) {
        result = fetchResponse.json();
        scryfallCacheByID[result.id] = result;
        scryfallCacheByName[result.name] = result;
        scryfallCacheBySetCode[result.set + result.collector_number] = result;
        return result;
      })
      .catch(function (reason) {
        console.log(
          "Problem in scryfallData fetch for ID " + id + ": " + reason
        );
      });
  } else {
    return Promise.resolve(result);
  }
};

world.fetchScryfallDataByName = function (name) {
  let result = scryfallCacheByName[name];
  if (result === undefined) {
    return fetch(SCRYFALL_URL + "cards/named?exact=" + encodeURI(name))
      .then(function (fetchResponse) {
        result = fetchResponse.json();
        scryfallCacheByID[result.id] = result;
        scryfallCacheByName[result.name] = result;
        scryfallCacheBySetCode[result.set + result.collector_number] = result;
        return result;
      })
      .catch(function (reason) {
        console.log(
          "Problem in scryfallData fetch for name " + name + ": " + reason
        );
      });
  } else {
    return Promise.resolve(result);
  }
};

world.fetchScryfallDataBySetCode = function (code, number) {
  let result = scryfallCacheBySetCode[code + number];
  if (result === undefined) {
    return fetch(
      SCRYFALL_URL + "cards/" + code.toLowerCase() + "/" + number.toLowerCase()
    )
      .then(function (fetchResponse) {
        result = fetchResponse.json();
        scryfallCacheByID[result.id] = result;
        scryfallCacheByName[result.name] = result;
        scryfallCacheBySetCode[result.set + result.collector_number] = result;
        return result;
      })
      .catch(function (reason) {
        console.log(
          "Problem in scryfallData fetch for set code " +
            code +
            number +
            ": " +
            reason
        );
      });
  } else {
    return Promise.resolve(result);
  }
};

let allSets,
  allBoosters = {},
  allDecks;

function parseArgs(cmdline) {
  result = [];
  word = "";
  inQuotes = false;
  for (let i = 0; i < cmdline.length; i++) {
    const c = cmdline.charAt(i);
    if (inQuotes) {
      if (c == '"') {
        result.push(word);
        word = "";
        inQuotes = false;
      } else {
        word += c;
      }
    } else {
      if (c == " ") {
        if (word) {
          result.push(word);
          word = "";
        }
      } else if (c == '"') {
        if (word) {
          result.push(word);
          word = "";
        }
        inQuotes = true;
      } else {
        word += c;
      }
    }
  }
  if (word) {
    result.push(word);
  }
  return result;
}

function normalize(s) {
  return s.replace(/[^a-zA-Z\d]/g, "").toUpperCase();
}

class ImportCardInfo {
  constructor(options = {}) {
    this.id = options.id;
    this.name = options.name;
    this.setCode = options.setCode;
    this.setNumber = options.setNumber;
    this.quantity = options.quantity === undefined ? 1 : options.quantity;
  }

  makeCard(sender, deckObject = undefined, deckIndex = 0) {
    const self = this;

    function processCard(id) {
      const cpos = sender.getCursorPosition();
      for (let j = 0; j < self.quantity; j++) {
        const newCard = world.createObjectFromTemplate(
          CARD_TEMPLATE,
          new Vector(cpos.x, cpos.y + deckIndex * 10, cpos.z + 4)
        );
        newCard.setAllCardInfo([{ id: id }]);
        if (deckObject === undefined) {
          deckObject = newCard;
        } else {
          deckObject.addCards(newCard);
        }
      }
      return deckObject;
    }

    if (this.id) {
      return Promise.resolve(processCard(self.id));
    } else if (this.setCode && this.setNumber) {
      return world
        .fetchScryfallDataBySetCode(this.setCode, this.setNumber)
        .then(function (card) {
          if (card.id === undefined) {
            throw card.details;
          }
          return processCard(card.id);
        });
    } else if (this.name) {
      return world.fetchScryfallDataByName(this.name).then(function (card) {
        if (card.id === undefined) {
          throw card.details;
        }
        return processCard(card.id);
      });
    } else {
      throw "bad world.ImportCardInfo object!";
    }
  }
}
world.ImportCardInfo = ImportCardInfo;

world.importCards = function (sender, cards, deckIndex, onSuccess) {
  const cards_ = [...cards];

  function doImport(deckObject) {
    const card = cards_.shift();
    card.makeCard(sender, deckObject, deckIndex).then(function (deckObject) {
      if (cards_.length > 0) {
        doImport(deckObject);
      } else {
        onSuccess(deckObject);
      }
    });
  }

  if (cards_.length > 0) {
    doImport(undefined);
  } else {
    sender.sendChatMessage("No cards to import!", new Color(255, 0, 0));
  }
};

function fetchSetDatabase() {
  if (allSets === undefined) {
    console.log("fetching set database");
    return fetch(MTGJSON_URL + "SetList.json").then(function (response) {
      allSets = response.json().data;
      console.log("set database fetched");
      return allSets;
    });
  } else {
    console.log("Using cached set database");
    return new Promise(function (resolve, reject) {
      resolve(allSets);
    });
  }
}

function fetchDeckDatabase() {
  if (allDecks === undefined) {
    console.log("fetching deck database");
    return fetch(MTGJSON_URL + "DeckList.json").then(function (response) {
      allDecks = response.json().data;
      console.log("deck database fetched");
      return allDecks;
    });
  } else {
    console.log("Using cached deck database");
    return new Promise(function (resolve, reject) {
      resolve(allDecks);
    });
  }
}

function commandImport(sender, args) {
  // TODO: ManaStack, untapped.gg
  console.log("Import command recieved!");
  const deckurl = url.parse(args[0]);

  if (deckurl.hostname == "archidekt.com") {
    sender.sendChatMessage(
      "Importing deck from Archidekt...",
      new Color(0, 255, 0)
    );
    const apiURL =
      "https://archidekt.com/api/decks/" +
      deckurl.pathname.split("/")[2] +
      "/small/?format=json";
    console.log("Doing archidekt import via URL: " + apiURL);
    fetch(apiURL)
      .then(function (response) {
        console.log("Got a response!");
        const deck = response.json();

        const mainCards = [];
        deck.cards.forEach(function (card) {
          let mainboard = true;
          card.categories.forEach((categoryName) => {
            if (categoryName.toLowerCase() == "sideboard") {
              mainboard = false;
            }
            if (categoryName.toLowerCase() == "commander") {
              mainboard = false;
            }
            let category = deck.categories.filter(
              (category) =>
                category.name.toLowerCase() == categoryName.toLowerCase()
            )[0];
            if (category !== undefined && !category.includedInDeck) {
              mainboard = false;
            }
          });
          if (mainboard) {
            console.log("Adding " + card.card.uid + " to mainboard");
            mainCards.push(
              new world.ImportCardInfo({
                id: card.card.uid,
                quantity: card.quantity,
              })
            );
          }
        });
        world.importCards(sender, mainCards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card mainboard!",
            new Color(0, 255, 0)
          );
        });

        const sideCards = [];
        deck.cards.forEach(function (card) {
          if (card.categories.includes("Sideboard")) {
            console.log("Adding " + card.card.uid + " to sideboard");
            sideCards.push(
              new world.ImportCardInfo({
                id: card.card.uid,
                quantity: card.quantity,
              })
            );
          }
        });
        if (sideCards.length > 0)
          world.importCards(sender, sideCards, 1, function (deckObject) {
            sender.sendChatMessage(
              "Successfully imported " +
                deckObject.getStackSize() +
                "-card sideboard!",
              new Color(0, 255, 0)
            );
          });

        const commanderCards = [];
        deck.cards.forEach(function (card) {
          if (card.categories.includes("Commander")) {
            console.log("Adding " + card.card.uid + " to commanders");
            commanderCards.push(
              new world.ImportCardInfo({
                id: card.card.uid,
                quantity: card.quantity,
              })
            );
          }
        });
        if (commanderCards.length > 0)
          world.importCards(sender, commanderCards, 1, function (deckObject) {
            sender.sendChatMessage(
              "Successfully imported " +
                deckObject.getStackSize() +
                " commanders!",
              new Color(0, 255, 0)
            );
          });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (deckurl.hostname == "tappedout.net") {
    sender.sendChatMessage(
      "Importing deck from TappedOut...",
      new Color(0, 255, 0)
    );
    fetch(url.format(deckurl))
      .then(function (response) {
        const $ = cheerio.load(response.text());
        const mainCards = [],
          commanders = [];

        $(".boardlist .member").each(function (i, v) {
          var cardName = $(".card .card-link", v).attr("data-name");
          var cardQty = parseInt($(".qty", v).attr("data-qty"));
          mainCards.push(
            new world.ImportCardInfo({ name: cardName, quantity: cardQty })
          );
        });
        $(".card-hover:has(.commander-img)").each(function (i, v) {
          var cardName = $(v).attr("data-name");
          commanders.push(new world.ImportCardInfo({ name: cardName }));
        });

        world.importCards(sender, mainCards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card mainboard and sideboard!",
            new Color(0, 255, 0)
          );
        });

        if (commanders.length > 0)
          world.importCards(sender, commanders, 1, function (deckObject) {
            sender.sendChatMessage(
              "Successfully imported " +
                deckObject.getStackSize() +
                " commanders!",
              new Color(0, 255, 0)
            );
          });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (deckurl.hostname == "www.mtggoldfish.com") {
    sender.sendChatMessage(
      "Importing deck from MtG Goldfish...",
      new Color(0, 255, 0)
    );
    fetch(url.format(deckurl))
      .then(function (response) {
        const $ = cheerio.load(response.text());
        const mainCards = [];

        $("#tab-paper .deck-table-container .deck-view-deck-table tbody tr")
          .filter(function (i, v) {
            return !$(v).hasClass("deck-category-header");
          })
          .each(function (i, v) {
            var cardQty = parseInt($("td:nth-child(1)", v).text().trim());
            var cardName = $("td:nth-child(2) span a", v).text().trim();
            mainCards.push(
              new world.ImportCardInfo({ name: cardName, quantity: cardQty })
            );
          });

        world.importCards(sender, mainCards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card deck!",
            new Color(0, 255, 0)
          );
        });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (
    deckurl.hostname == "moxfield.com" ||
    deckurl.hostname == "www.moxfield.com"
  ) {
    sender.sendChatMessage(
      "Importing deck from Moxfield...",
      new Color(0, 255, 0)
    );
    fetch("https://api.moxfield.com/v2/decks/all/" + deckurl.path.split("/")[2])
      .then(function (response) {
        const deckJson = response.json();
        const mainCards = [],
          commanders = [];

        Object.values(deckJson.mainboard).forEach(function (v) {
          mainCards.push(
            new world.ImportCardInfo({
              id: v.card.scryfall_id,
              quantity: v.quantity,
            })
          );
        });
        world.importCards(sender, mainCards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card mainboard!",
            new Color(0, 255, 0)
          );
        });

        Object.values(deckJson.commanders).forEach(function (v) {
          commanders.push(
            new world.ImportCardInfo({
              id: v.card.scryfall_id,
              quantity: v.quantity,
            })
          );
        });
        if (commanders.length > 0)
          world.importCards(sender, commanders, 1, function (deckObject) {
            sender.sendChatMessage(
              "Successfully imported " +
                deckObject.getStackSize() +
                " commanders!",
              new Color(0, 255, 0)
            );
          });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (
    deckurl.hostname == "aetherhub.com" ||
    deckurl.hostname == "www.aetherhub.com"
  ) {
    sender.sendChatMessage(
      "Importing deck from AetherHub...",
      new Color(0, 255, 0)
    );
    fetch(url.format(deckurl))
      .then(function (response) {
        const $ = cheerio.load(response.text());
        const cards = [];

        $(".tab-pane[id*='tab_full_'] .hover-imglink").each(function (i, v) {
          const cardName = $(".cardLink", v).attr("data-card-name");
          console.log(
            $(v)
              .contents()
              .filter(function (_) {
                return this.nodeType == 3; // Node.TEXT_NODE
              })
              .text()
          );
          const cardQty = parseInt(
            $(v)
              .contents()
              .filter(function (_) {
                return this.nodeType == 3; // Node.TEXT_NODE
              })
              .text()
          );
          console.log("Importing " + cardQty + "x " + cardName + "...");
          cards.push(
            new world.ImportCardInfo({ name: cardName, quantity: cardQty })
          );
        });

        world.importCards(sender, cards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card deck!",
            new Color(0, 255, 0)
          );
        });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (
    deckurl.hostname == "deckstats.net" ||
    deckurl.hostname == "www.deckstats.net"
  ) {
    sender.sendChatMessage(
      "Importing deck from Deckstats...",
      new Color(0, 255, 0)
    );
    fetch(
      "https://deckstats.net/api.php?action=get_deck&id_type=saved&owner_id=" +
        deckurl.path.split("/")[2] +
        "&id=" +
        deckurl.path.split("/")[3].replace(/\D/g, "") +
        "&response_type=list"
    )
      .then(function (response) {
        const cards = [];

        response
          .json()
          .list.trim()
          .split("\n")
          .filter(function (x) {
            return !x.startsWith("//");
          })
          .map(function (x) {
            const splitted = x.replace(/^SB:/, "").trim().split(" ");
            const qty = splitted[0].match(/^\d/)
              ? parseInt(splitted[0].replace(/\D/g, ""))
              : 1;
            return [
              qty,
              splitted
                .slice(1)
                .filter(function (word) {
                  return !word.match(/^[!#*\[\(]/);
                })
                .join(" ")
                .trim(),
            ];
          })
          .forEach(function (kv) {
            const cardQty = kv[0];
            const cardName = kv[1];
            cards.push(
              new world.ImportCardInfo({ name: cardName, quantity: cardQty })
            );
          });

        world.importCards(sender, cards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card deck!",
            new Color(0, 255, 0)
          );
        });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (
    deckurl.hostname == "mtgtop8.com" ||
    deckurl.hostname == "www.mtgtop8.com"
  ) {
    sender.sendChatMessage(
      "Importing deck from MTG Top 8...",
      new Color(0, 255, 0)
    );
    fetch(url.format(deckurl))
      .then(function (response) {
        const $ = cheerio.load(response.text());
        const cards = [];

        $(".deck_line").each(function (i, v) {
          const cardQty = parseInt(
            $(v)
              .contents()
              .filter(function (_) {
                return this.nodeType == 3; // Node.TEXT_NODE
              })
              .text()
          );
          const cardName = $("span", v).text();
          cards.push(
            new world.ImportCardInfo({ name: cardName, quantity: cardQty })
          );
        });

        world.importCards(sender, cards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card deck!",
            new Color(0, 255, 0)
          );
        });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (
    deckurl.hostname == "mtgvault.com" ||
    deckurl.hostname == "www.mtgvault.com"
  ) {
    sender.sendChatMessage(
      "Importing deck from MTG Vault...",
      new Color(0, 255, 0)
    );
    fetch(url.format(deckurl))
      .then(function (response) {
        const $ = cheerio.load(response.text());
        const cards = [];

        $(".deck-card").each(function (i, v) {
          var cardQty = parseInt(
            $("span", v)
              .contents()
              .filter(function (_) {
                return this.nodeType == 3; // Node.TEXT_NODE
              })
              .text()
              .replace(/\D/g, "")
          );
          var cardName = $("span a", v).text();
          if (isNaN(cardQty)) {
            cardQty = parseInt(
              $("span:nth-child(1)", v)
                .contents()
                .filter(function (_) {
                  return this.nodeType == 3; // Node.TEXT_NODE
                })
                .text()
                .replace(/\D/g, "")
            );
            cardName = $("span:nth-child(2) a", v).text();
          }
          cards.push(
            new world.ImportCardInfo({ name: cardName, quantity: cardQty })
          );
        });

        world.importCards(sender, cards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card deck!",
            new Color(0, 255, 0)
          );
        });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else if (
    deckurl.hostname == "cubecobra.com" ||
    deckurl.hostname == "www.cubecobra.com"
  ) {
    sender.sendChatMessage(
      "Importing cube from CubeCobra...",
      new Color(0, 255, 0)
    );
    fetch(
      "https://cubecobra.com/cube/api/cubeJSON/" +
        deckurl.path.split("/").slice(-1)[0]
    )
      .then(function (response) {
        const cube = response.json();
        const cards = [];

        cube.cards.forEach((card) => {
          cards.push(new world.ImportCardInfo({ id: card.cardID }));
        });

        world.importCards(sender, cards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card cube!",
            new Color(0, 255, 0)
          );
        });
      })
      .catch(function (reason) {
        internalError(sender, "import", reason);
      });
  } else {
    sender.sendChatMessage(
      "Unknown deck hosting site " + deckurl.hostname + "!",
      new Color(255, 0, 0)
    );
  }
}

function commandSets(sender, args) {
  function listPacks(allSets) {
    sender.sendChatMessage("Sets matching your search:", new Color(0, 255, 0));
    result = "";
    allSets.forEach((set) => {
      let matches = true;
      args.forEach((term) => {
        if (
          !normalize(set.name).includes(normalize(term)) &&
          !set.code.includes(normalize(term))
        ) {
          matches = false;
        }
      });
      if (matches) {
        if (result) {
          result += ", ";
        }
        result += set.name + " (" + set.code + ")";
      }
    });
    sender.sendChatMessage(result, new Color(0, 255, 0));
  }

  fetchSetDatabase()
    .then(listPacks)
    .catch(function (reason) {
      internalError(sender, "sets", reason);
    });
}

function commandPack(sender, rawargs) {
  console.log("Pack command recieved!");
  const args = parseArgs(rawargs.join(" "));
  if (args.length == 0 || args.length > 2) {
    sender.sendChatMessage("Usage: /pack <name> [qty]", new Color(255, 0, 0));
    return;
  }
  console.log("Fetching pack " + args[0] + "...");

  function makePack(allSets) {
    const qty = args.length == 1 ? 1 : Number.parseInt(args[1]);
    const searchTerm = normalize(args[0]);
    let packData;
    for (let i = 0; i < allSets.length; i++) {
      const pack = allSets[i];
      if (
        normalize(pack.name) == searchTerm ||
        normalize(pack.code) == searchTerm
      ) {
        packData = pack;
        break;
      }
    }
    if (packData === undefined) {
      sender.sendChatMessage(
        "Could not find a pack called " + args[0] + "!",
        new Color(255, 0, 0)
      );
      sender.sendChatMessage(
        "(Valid inputs include the set's name or code.)",
        new Color(255, 0, 0)
      );
    } else {
      sender.sendChatMessage(
        "Making " + qty + " packs of " + packData.name + "...",
        new Color(0, 255, 0)
      );

      function addCardsToPacks() {
        // find entry for us in booster database
        const fullSetData = allBoosters[packData.code];
        const booster = fullSetData.booster.default || fullSetData.booster.draft;
        for (let i = 0; i < qty; i++) {
          // generate a new pack
          console.log("Making pack " + i);
          const cardsToGenerate = [];
          // packs have a weighted chance to have different rarities in different slots
          const packTypeSelected = Math.random() * booster.boostersTotalWeight;
          let packType;
          let totalWeight = 0;
          for (let j = 0; j < booster.boosters.length; j++) {
            const element = booster.boosters[j];
            totalWeight += element.weight;
            if (totalWeight >= packTypeSelected) {
              packType = element;
              break;
            }
          }
          console.assert(packType !== undefined);
          // generate a list of what cards from what sheets will appear
          const cardSheets = Object.entries(packType.contents)
            .map(([k, v]) => Array(v).fill(k))
            .reduce((a, b) => [...a, ...b]);
          // each card comes from a specific sheet, again at a weighted chance
          cardSheets.forEach(function (sheetName) {
            console.log("    Adding card  of rarity " + sheetName);
            const sheet = booster.sheets[sheetName];
            const cards = Object.entries(sheet.cards);
            const cardSelected = Math.random() * sheet.totalWeight;
            let totalWeight = 0;
            let mtgjsonID;
            for (let k = 0; k < cards.length; k++) {
              const element = cards[k];
              totalWeight += element[1];
              if (totalWeight >= cardSelected) {
                mtgjsonID = element[0];
                break;
              }
            }
            console.assert(mtgjsonID !== undefined);
            // get full card data
            const fullCardData = fullSetData.cards.filter(
              (c) => c.uuid == mtgjsonID
            )[0];
            console.assert(fullCardData !== undefined);
            // add the card to the pack
            cardsToGenerate.push(
              new world.ImportCardInfo({
                setCode: fullCardData.setCode,
                setNumber: fullCardData.number,
              })
            );
          });
          // actually make the cards now
          world.importCards(sender, cardsToGenerate, i, function (deckObject) {
            sender.sendChatMessage(
              "Successfully generated pack " +
                (i + 1) +
                " of " +
                packData.name +
                "!",
              new Color(0, 255, 0)
            );
          });
        }
      }

      if (allBoosters[packData.code] === undefined) {
        console.log("fetching booster info for " + packData.code);
        fetch(MTGJSON_URL + packData.code + ".json")
          .then(function (response) {
            allBoosters[packData.code] = response.json().data;
            console.assert(allBoosters[packData.code] !== undefined);
            console.log("booster info for " + packData.code + " fetched");
            addCardsToPacks();
          })
          .catch(function (reason) {
            internalError(sender, "pack", reason);
          });
      } else {
        console.log("Using cached booster database for " + packData.code);
        addCardsToPacks();
      }
    }
  }

  fetchSetDatabase()
    .then(makePack)
    .catch(function (reason) {
      internalError(sender, "pack", reason);
    });
}

function commandDeck(sender, rawargs) {
  console.log("Deck command recieved!");
  const args = parseArgs(rawargs.join(" "));
  if (args.length == 0 || args.length > 1) {
    sender.sendChatMessage("Usage: /deck <name>", new Color(255, 0, 0));
    return;
  }
  console.log("Fetching precon deck " + args[0] + "...");

  function makeDeck(allDecks) {
    const deckInfo = allDecks.filter(
      (d) => normalize(d.name) == normalize(args[0])
    )[0];
    if (deckInfo === undefined) {
      sender.sendChatMessage(
        "No deck found with the name '" + args[0] + "'!",
        new Color(255, 0, 0)
      );
      return;
    }
    sender.sendChatMessage(
      "Importing precon deck '" + deckInfo.name + "'...",
      new Color(0, 255, 0)
    );
    fetch(MTGJSON_URL + "decks/" + deckInfo.fileName + ".json")
      .then(function (response) {
        const deckContents = response.json().data;
        console.log(JSON.stringify(deckContents.commander));

        const cards = [];
        deckContents.mainBoard.forEach(function (card) {
          cards.push(
            new world.ImportCardInfo({
              setCode: card.setCode,
              setNumber: card.number,
              quantity: card.count,
            })
          );
        });
        world.importCards(sender, cards, 0, function (deckObject) {
          sender.sendChatMessage(
            "Successfully imported " +
              deckObject.getStackSize() +
              "-card mainboard!",
            new Color(0, 255, 0)
          );
        });

        if (deckContents.sideBoard && deckContents.sideBoard.length > 0) {
          const sideCards = [];
          deckContents.sideBoard.forEach(function (card) {
            sideCards.push(
              new world.ImportCardInfo({
                setCode: card.setCode,
                setNumber: card.number,
                quantity: card.count,
              })
            );
          });
          world.importCards(sender, sideCards, 1, function (deckObject) {
            sender.sendChatMessage(
              "Successfully imported " +
                deckObject.getStackSize() +
                "-card sideboard!",
              new Color(0, 255, 0)
            );
          });
        }

        if (deckContents.commander && deckContents.commander.length > 0) {
          const commanders = [];
          deckContents.commander.forEach(function (card) {
            commanders.push(
              new world.ImportCardInfo({
                setCode: card.setCode,
                setNumber: card.number,
                quantity: card.count,
              })
            );
          });
          world.importCards(sender, commanders, 1, function (deckObject) {
            sender.sendChatMessage(
              "Successfully imported " +
                deckObject.getStackSize() +
                " commanders!",
              new Color(0, 255, 0)
            );
          });
        }
      })
      .catch(function (reason) {
        internalError(sender, "deck", reason);
      });
  }

  fetchDeckDatabase()
    .then(makeDeck)
    .catch(function (reason) {
      internalError(sender, "deck", reason);
    });
}

function commandDecks(sender, args) {
  function listDecks(allDecks) {
    sender.sendChatMessage(
      "Preconstructed decks matching your search:",
      new Color(0, 255, 0)
    );
    result = "";
    allDecks.forEach((deck) => {
      let matches = true;
      args.forEach((term) => {
        if (
          !normalize(deck.name).includes(normalize(term)) &&
          !deck.code.includes(normalize(term))
        ) {
          matches = false;
        }
      });
      if (matches) {
        if (result) {
          result += ", ";
        }
        result += deck.name + " (" + deck.code + ")";
      }
    });
    sender.sendChatMessage(result, new Color(0, 255, 0));
  }

  fetchDeckDatabase()
    .then(listDecks)
    .catch(function (reason) {
      internalError(sender, "decks", reason);
    });
}

function commandImportRaw(sender, args) {
  console.log("Rawimport command recieved!");
  fetch(args[0])
    .then((response) => {
      try {
        world.importCards(
          sender,
          response
            .text()
            .split(/[\r\n]+/)
            .map((line) => {
              var name = undefined,
                setCode = undefined,
                setNumber = undefined;
              var qty = 1;
              var foundFirstWord = false,
                couldBeSetNumber = false,
                inOptions = false;

              line.split(/\s+/).forEach((word) => {
                if (word.match(/^[#*^\[]/) || word.match(/[#*^\]]$/)) {
                  // filter out tags, foil, printing, and other options
                  inOptions = true;
                } else if (word.match(/^\([^\)]*\)$/)) {
                  // text in parens is set code
                  setCode = word.replace(/[\(\)]/g, "");
                  couldBeSetNumber = true;
                } else if (couldBeSetNumber) {
                  // in MTGA format, set number is unquoted and always follows set code
                  couldBeSetNumber = false;
                  setNumber = word;
                } else if (inOptions) {
                  // sometimes, options (like Moxfield tags) can contain spaces; ignore them
                } else {
                  var parseAsName = true;

                  if (!foundFirstWord) {
                    const qtyMatch = word.match(/^(\d+)[xX]?$/);
                    if (qtyMatch) {
                      parseAsName = false;
                      qty = Number(qtyMatch[1]);
                    }
                  }

                  if (parseAsName) {
                    if (word.match(/^[/\\][/\\]?$/)) {
                      // normalize the name of dfcs
                      word = "//";
                    }
                    if (name) {
                      name = name + " " + word;
                    } else {
                      name = word;
                    }
                  }
                }

                foundFirstWord = true;
              });

              if (name === undefined) {
                throw "Unparsable line in file: '" + line + "'";
              }

              return new ImportCardInfo({
                name: name,
                quantity: qty,
                setCode: setCode,
                setNumber: setNumber,
              });
            }),
          0,
          (deckObject) => {
            sender.sendChatMessage(
              deckObject.getStackSize() + " cards successfully imported!",
              new Color(0, 255, 0)
            );
          }
        );
      } catch (reason) {
        console.log("Exception in parsing /rawimport: " + reason);
        console.trace(reason);
        sender.sendChatMessage(
          "Error in parsing decklist: " + reason,
          new Color(255, 0, 0)
        );
      }
    })
    .catch((reason) => {
      internalError(sender, "rawimport", reason);
    });
}

function commandJumpstart(sender, rawargs) {
  const args = parseArgs(rawargs.join(" "));
  if (args.length < 1 || args.length > 2) {
    sender.sendChatMessage(
      "Usage: /jumpstart <set> [qty]",
      new Color(255, 0, 0)
    );
    return;
  }
  const set = args[0];
  const qty = args.length <= 1 ? 1 : Number(args[1]);
  fetchSetDatabase()
    .then(function (allSets) {
      const searchTerm = normalize(set);
      let packData;
      for (let i = 0; i < allSets.length; i++) {
        const pack = allSets[i];
        if (
          normalize(pack.name) == searchTerm ||
          normalize(pack.code) == searchTerm
        ) {
          packData = pack;
          break;
        }
      }
      if (packData === undefined) {
        sender.sendChatMessage(
          "Could not find a set called " + set + "!",
          new Color(255, 0, 0)
        );
        sender.sendChatMessage(
          "(Valid inputs include the set's name or code.)",
          new Color(255, 0, 0)
        );
        return;
      }
      fetchDeckDatabase()
        .then(function (allDecks) {
          const possibleDecks = [];
          for (let i = 0; i < allDecks.length; i++) {
            const deck = allDecks[i];
            if (deck.code === packData.code) {
              possibleDecks.push(deck);
            }
          }
          if (possibleDecks.length === 0) {
            sender.sendChatMessage(
              "Set '" +
                packData.name +
                "' has no Jumpstart packs or decks associated with it!",
              new Color(255, 0, 0)
            );
            return;
          }
          for (let i = 0; i < qty; i++) {
            let deckInfo =
              possibleDecks[Math.floor(Math.random() * possibleDecks.length)];
            fetch(MTGJSON_URL + "decks/" + deckInfo.fileName + ".json")
              .then(function (response) {
                const deckContents = response.json().data;
                const cards = [];
                deckContents.mainBoard.forEach(function (card) {
                  cards.push(
                    new world.ImportCardInfo({
                      setCode: card.setCode,
                      setNumber: card.number,
                      quantity: card.count,
                    })
                  );
                });
                if (
                  deckContents.sideBoard &&
                  deckContents.sideBoard.length > 0
                ) {
                  deckContents.sideBoard.forEach(function (card) {
                    cards.push(
                      new world.ImportCardInfo({
                        setCode: card.setCode,
                        setNumber: card.number,
                        quantity: card.count,
                      })
                    );
                  });
                }
                if (
                  deckContents.commanders &&
                  deckContents.commanders.length > 0
                ) {
                  deckContents.commanders.forEach(function (card) {
                    cards.push(
                      new world.ImportCardInfo({
                        setCode: card.setCode,
                        setNumber: card.number,
                        quantity: card.count,
                      })
                    );
                  });
                }
                world.importCards(sender, cards, i, function (deckObject) {
                  sender.sendChatMessage(
                    "Successfully generated " +
                      deckObject.getStackSize() +
                      "-card " +
                      packData.name +
                      " pack!",
                    new Color(0, 255, 0)
                  );
                });
              })
              .catch(function (reason) {
                internalError(sender, "jumpstart", reason);
              });
          }
        })
        .catch(function (reason) {
          internalError(sender, "jumpstart", reason);
        });
    })
    .catch(function (reason) {
      internalError(sender, "jumpstart", reason);
    });
}

COMMANDS = {
  import: commandImport,
  sets: commandSets,
  pack: commandPack,
  deck: commandDeck,
  decks: commandDecks,
  rawimport: commandImportRaw,
  jumpstart: commandJumpstart,
};

function internalError(sender, command, reason) {
  console.log("Exception in /" + command + ": " + reason);
  console.trace(reason);
  sender.sendChatMessage("An internal error occured!", new Color(255, 0, 0));
}

globalEvents.onChatMessage.add(function (sender, message) {
  const COMMAND_PREFIX = "/";
  if (message.startsWith(COMMAND_PREFIX)) {
    const words = message.split(/\s+/);
    const command = words.shift().slice(1);
    const commandFn = COMMANDS[command];
    if (!commandFn) {
      sender.sendChatMessage(
        "Unknown command: /" + command,
        new Color(255, 0, 0)
      );
      return;
    }

    try {
      commandFn(sender, words);
    } catch (reason) {
      internalError(sender, command, reason);
    }
  }
});
