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
    } else if (this.name) {
      return world.fetchScryfallDataByName(this.name).then(function (card) {
        if (card.id === undefined) {
          throw card.details;
        }
        return processCard(card.id);
      });
    } else if (this.setCode && this.setNumber) {
      return world
        .fetchScryfallDataBySetCode(this.setCode, this.setNumber)
        .then(function (card) {
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

globalEvents.onChatMessage.add(function (sender, message) {
  const COMMAND_IMPORT = "/import",
    COMMAND_SETS = "/sets",
    COMMAND_PACK = "/pack",
    COMMAND_DECK = "/deck";
  COMMAND_DECKS = "/decks";
  if (message.startsWith(COMMAND_IMPORT)) {
    // TODO: ManaStack
    try {
      console.log("Import command recieved!");
      const deckurl = url.parse(
        message.substring(COMMAND_IMPORT.length).trim()
      );

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
              world.importCards(
                sender,
                commanderCards,
                1,
                function (deckObject) {
                  sender.sendChatMessage(
                    "Successfully imported " +
                      deckObject.getStackSize() +
                      " commanders!",
                    new Color(0, 255, 0)
                  );
                }
              );
          })
          .catch(function (reason) {
            console.log("Problem in global Archidekt fetch: " + reason);
            sender.sendChatMessage(
              "An internal error occured!",
              new Color(255, 0, 0)
            );
          });
      } else if (deckurl.hostname == "tappedout.net") {
        sender.sendChatMessage(
          "Importing deck from TappedOut...",
          new Color(0, 255, 0)
        );
        fetch(url.format(deckurl)).then(function (response) {
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
        });
      } else if (deckurl.hostname == "www.mtggoldfish.com") {
        sender.sendChatMessage(
          "Importing deck from MtG Goldfish...",
          new Color(0, 255, 0)
        );
        fetch(url.format(deckurl)).then(function (response) {
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
        });
      } else if (
        deckurl.hostname == "moxfield.com" ||
        deckurl.hostname == "www.moxfield.com"
      ) {
        sender.sendChatMessage(
          "Importing deck from Moxfield...",
          new Color(0, 255, 0)
        );
        fetch(
          "https://api.moxfield.com/v2/decks/all/" + deckurl.path.split("/")[2]
        ).then(function (response) {
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
        });
      } else if (
        deckurl.hostname == "aetherhub.com" ||
        deckurl.hostname == "www.aetherhub.com"
      ) {
        sender.sendChatMessage(
          "Importing deck from AetherHub...",
          new Color(0, 255, 0)
        );
        fetch(url.format(deckurl)).then(function (response) {
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
        ).then(function (response) {
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
        });
      } else if (
        deckurl.hostname == "mtgtop8.com" ||
        deckurl.hostname == "www.mtgtop8.com"
      ) {
        sender.sendChatMessage(
          "Importing deck from MTG Top 8...",
          new Color(0, 255, 0)
        );
        fetch(url.format(deckurl)).then(function (response) {
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
        });
      } else if (
        deckurl.hostname == "mtgvault.com" ||
        deckurl.hostname == "www.mtgvault.com"
      ) {
        sender.sendChatMessage(
          "Importing deck from MTG Vault...",
          new Color(0, 255, 0)
        );
        fetch(url.format(deckurl)).then(function (response) {
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
        ).then(function (response) {
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
        });
      } else {
        sender.sendChatMessage(
          "Unknown deck hosting site " + deckurl.hostname + "!",
          new Color(255, 0, 0)
        );
      }
    } catch (reason) {
      console.log("Exception in /import: " + reason);
      console.trace(reason);
      sender.sendChatMessage(
        "An internal error occured!",
        new Color(255, 0, 0)
      );
    }
  } else if (message.startsWith(COMMAND_SETS)) {
    function listPacks() {
      const searchTerms = parseArgs(message.substring(COMMAND_SETS.length));
      sender.sendChatMessage(
        "Sets matching your search:",
        new Color(0, 255, 0)
      );
      result = "";
      allSets.forEach((set) => {
        let matches = true;
        searchTerms.forEach((term) => {
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

    if (allDecks === undefined) {
      console.log("fetching set database");
      fetch(MTGJSON_URL + "SetList.json")
        .then(function (response) {
          allSets = response.json().data;
          console.log("set database fetched");
          listPacks();
        })
        .catch(function (reason) {
          sender.sendChatMessage(
            "An error occured when fetching set information: " + reason,
            new Color(255, 0, 0)
          );
        });
    } else {
      console.log("Using cached set database");
      listPacks();
    }
  } else if (message.startsWith(COMMAND_PACK)) {
    console.log("Pack command recieved!");
    const args = parseArgs(message.substring(COMMAND_PACK.length));
    if (args.length == 0 || args.length > 2) {
      sender.sendChatMessage("Usage: /pack <name> [qty]", new Color(255, 0, 0));
      return;
    }
    console.log("Fetching pack " + args[0] + "...");

    function makePack() {
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
          const booster = fullSetData.booster.default;
          for (let i = 0; i < qty; i++) {
            // generate a new pack
            console.log("Making pack " + i);
            const cardsToGenerate = [];
            // packs have a weighted chance to have different rarities in different slots
            const packTypeSelected =
              Math.random() * booster.boostersTotalWeight;
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
            world.importCards(
              sender,
              cardsToGenerate,
              i,
              function (deckObject) {
                sender.sendChatMessage(
                  "Successfully generated pack " +
                    (i + 1) +
                    " of " +
                    packData.name +
                    "!",
                  new Color(0, 255, 0)
                );
              }
            );
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
              sender.sendChatMessage(
                "An error occured when fetching booster pack information: " +
                  reason,
                new Color(255, 0, 0)
              );
            });
        } else {
          console.log("Using cached booster database for " + packData.code);
          addCardsToPacks();
        }
      }
    }

    if (allSets === undefined) {
      console.log("fetching set database");
      fetch(MTGJSON_URL + "SetList.json")
        .then(function (response) {
          allSets = response.json().data;
          console.log("set database fetched");
          makePack();
        })
        .catch(function (reason) {
          sender.sendChatMessage(
            "An error occured when fetching set information: " + reason,
            new Color(255, 0, 0)
          );
        });
    } else {
      console.log("Using cached set database");
      makePack();
    }
  } else if (message.startsWith(COMMAND_DECKS)) {
    function listDecks() {
      const searchTerms = parseArgs(message.substring(COMMAND_DECKS.length));
      sender.sendChatMessage(
        "Preconstructed decks matching your search:",
        new Color(0, 255, 0)
      );
      result = "";
      allDecks.forEach((deck) => {
        let matches = true;
        searchTerms.forEach((term) => {
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

    if (allDecks === undefined) {
      console.log("fetching deck database");
      fetch(MTGJSON_URL + "DeckList.json")
        .then(function (response) {
          allDecks = response.json().data;
          console.log("deck database fetched");
          listDecks();
        })
        .catch(function (reason) {
          sender.sendChatMessage(
            "An error occured when fetching deck information: " + reason,
            new Color(255, 0, 0)
          );
        });
    } else {
      console.log("Using cached deck database");
      listDecks();
    }
  } else if (message.startsWith(COMMAND_DECK)) {
    console.log("Deck command recieved!");
    const args = parseArgs(message.substring(COMMAND_DECK.length));
    if (args.length == 0 || args.length > 1) {
      sender.sendChatMessage("Usage: /deck <name>", new Color(255, 0, 0));
      return;
    }
    console.log("Fetching precon deck " + args[0] + "...");

    function makeDeck() {
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
          sender.sendChatMessage(
            "An error occured when fetching deck contents: " + reason,
            new Color(255, 0, 0)
          );
        });
    }

    if (allDecks === undefined) {
      console.log("fetching deck database");
      fetch(MTGJSON_URL + "DeckList.json")
        .then(function (response) {
          allDecks = response.json().data;
          console.log("deck database fetched");
          makeDeck();
        })
        .catch(function (reason) {
          sender.sendChatMessage(
            "An error occured when fetching deck information: " + reason,
            new Color(255, 0, 0)
          );
        });
    } else {
      console.log("Using cached deck database");
      makeDeck();
    }
  }
});
