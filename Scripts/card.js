const {
  refCard,
  world,
  UIElement,
  VerticalBox,
  HorizontalBox,
  TextBox,
  Button,
  Rotator,
  Vector,
  Text,
  Border,
  fetch,
} = require("@tabletop-playground/api");

const SCRYFALL_URL = "https://api.scryfall.com/";

const ACTION_SET = "Set Card...",
  ACTION_ADD = "Add Card...",
  ACTION_TAP = "Tap",
  ACTION_UNTAP = "Untap";

function updateCardProperties(card) {
  for (let i = 0; i < card.data.length; i++) {
    const cardState = card.data[i];
    const cardIndex = i;

    card.removeCustomAction(ACTION_SET);
    card.removeCustomAction(ACTION_ADD);

    if (cardState.id === undefined) {
      card.setTextureOverrideURLAt(undefined, cardIndex);
      if (card.getStackSize() == 1) {
        card.setName(undefined);
        card.addCustomAction(ACTION_SET, "Set this card by name.");
      }
    } else {
      card.addCustomAction(ACTION_ADD, "Add a card by name to this stack.");
      fetch(SCRYFALL_URL + "cards/" + cardState.id, {})
        .then(function (fetchResponse) {
          const cardData = fetchResponse.json();
          if (cardData.image_uris !== undefined) {
            card.setTextureOverrideURLAt(cardData.image_uris.large, cardIndex);
          }
          if (card.getStackSize() == 1) {
            card.setName(cardData.name);
          }
        })
        .catch(function (reason) {
          console.log(
            "[" +
              refCard.getId() +
              "] Problem in Scryfall image fetch: " +
              reason
          );
        });
    }
  }

  if (card.getStackSize() != 1) {
    card.setName(undefined);
  }

  if (card.tapped) {
    card.removeCustomAction(ACTION_TAP);
    card.addCustomAction(ACTION_UNTAP, "Untap this card.");
  } else {
    card.removeCustomAction(ACTION_UNTAP);
    card.addCustomAction(ACTION_TAP, "Tap this card.");
  }
}

function updateCards(cards) {
  updateCardProperties(cards);
  for (let i = 0; i < cards.data.length; i++) {
    try {
      const card = cards.data[i];
      cards.setSavedData(JSON.stringify(card), i.toString());
      console.log(
        "[" +
          refCard.getId() +
          "] Saving card data for index " +
          i +
          ": " +
          JSON.stringify(JSON.stringify(card))
      );
    } catch (e) {
      cards.setSavedData(JSON.stringify({}), i.toString());
      console.log(
        "[" + refCard.getId() + "] WARNING: Saving data failed for index " + i
      );
      console.trace(e);
    }
  }
}

// load saved data
if (refCard.data === undefined) {
  refCard.data = [];
  for (let i = 0; i < refCard.getStackSize(); i++) {
    const cardData = refCard.getSavedData(i.toString());
    if (cardData === undefined) {
      refCard.data.push({});
    } else {
      try {
        refCard.data.push(JSON.parse(cardData));
        console.log(
          "[" +
            refCard.getId() +
            "] Loading card data for index " +
            i +
            ": " +
            JSON.stringify(JSON.parse(cardData))
        );
      } catch (e) {
        refCard.data.push({});
        console.log(
          "[" +
            refCard.getId() +
            "] WARNING: Error on data string " +
            cardData +
            " for card index " +
            i
        );
        console.trace(e);
      }
    }
  }
} else {
  console.log("[" + refCard.getId() + "] Already had data");
}

updateCards(refCard);

// handle actions
var dialogUiIndex = undefined;

function showSearchDialog(callback) {
  const ui = new UIElement();
  ui.position = new Vector(0, 0, refCard.isFaceUp() ? -1 : 1);
  ui.rotation = new Rotator(
    refCard.isFaceUp() ? 180 : 0,
    refCard.isFaceUp() ? 180 : 0,
    0
  );
  var searchBox, matches;
  var nMatches = 0;
  ui.widget = new Border().setChild(
    new VerticalBox()
      .addChild(
        new HorizontalBox()
          .addChild(new Text().setText("Search:"))
          .addChild((searchBox = new TextBox()))
      )
      .addChild((matches = new VerticalBox()))
  );
  dialogUiIndex = refCard.addUI(ui);

  searchBox.onTextChanged.add(function (_, player, text) {
    for (let i = 0; i < nMatches; i++) {
      matches.removeChildAt(0);
    }
    nMatches = 0;
    const MAX_MATCHES = 5;

    fetch(
      SCRYFALL_URL +
        "cards/autocomplete?q=" +
        encodeURI(text) +
        "&include_extras=true"
    )
      .then(function (response) {
        const catalog = response.json();
        catalog.data.forEach(function (cardName) {
          nMatches++;
          if (nMatches >= MAX_MATCHES) {
            return;
          }
          var cardButton;
          matches.addChild((cardButton = new Button().setText(cardName)));
          cardButton.onClicked.add(function (_, player) {
            fetch(SCRYFALL_URL + "cards/named?exact=" + encodeURI(cardName))
              .then(function (response) {
                var card = response.json();
                refCard.removeUI(dialogUiIndex);
                dialogUiIndex = undefined;
                callback(card);
              })
              .catch(function (reason) {
                console.log(
                  "[" +
                    refCard.getId() +
                    "] Problem in Scryfall by-name fetch: " +
                    reason
                );
              });
          });
        });
      })
      .catch(function (reason) {
        console.log(
          "[" +
            refCard.getId() +
            "] Problem in Scryfall autocomplete fetch: " +
            reason
        );
      });
  });
}

function toggleTapped(card) {
  try {
    if (card.tapped) {
      console.log("Untapping!");
      card.setRotation(card.getRotation().compose(new Rotator(0, -90, 0)), 1);
    } else {
      console.log("Tapping!");
      card.setRotation(card.getRotation().compose(new Rotator(0, 90, 0)), 1);
    }
    card.tapped = !card.tapped;

    if (card.tapped) {
      card.removeCustomAction(ACTION_TAP);
      card.addCustomAction(ACTION_UNTAP, "Untap this card.");
    } else {
      card.removeCustomAction(ACTION_UNTAP);
      card.addCustomAction(ACTION_TAP, "Tap this card.");
    }
  } catch (e) {
    console.log("error in tapping: " + e);
    console.trace(e);
  }
}

refCard.onCustomAction.add(function (_, player, name) {
  switch (name) {
    case ACTION_SET:
      showSearchDialog(function (card) {
        refCard.data[0].id = card.id;
        updateCards(refCard);
      });
      break;
    case ACTION_ADD:
      showSearchDialog(function (card) {
        var newCard = world.createObjectFromTemplate(
          "259D66CE415FF02DA2381FBCDB053E1B",
          player.getCursorPosition()
        );
        newCard.data = [{ id: card.id }];
        newCard.updateCards(newCard);
        refCard.addCards(newCard);
        updateCards(refCard);
      });
      break;
    case ACTION_UNTAP:
    case ACTION_TAP:
      toggleTapped(refCard);
      break;
  }
});

refCard.onPrimaryAction.add(function (_, player) {
  if (refCard.getStackSize() == 1) {
    // tap and untap only if we're not shuffling; that is, if we're 1 card
    toggleTapped(refCard);
  } else {
    // actually shuffle it here, as the TTP shuffler does not inform us of
    // changes to card states
    let currentIndex = refCard.data.length,
      randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [refCard.data[currentIndex], refCard.data[randomIndex]] = [
        refCard.data[randomIndex],
        refCard.data[currentIndex],
      ];
    }
    updateCards(refCard);
  }
});

// handle splitting/merging
refCard.onRemoved.add(function (_, removedCard, index, player) {
  console.log(
    "Removing index " +
      index +
      "(refCard = " +
      refCard.getId() +
      ", removedCard = " +
      removedCard.getId() +
      ")"
  );
  removedCard.data = refCard.data.splice(index, 1);
  updateCards(removedCard);
  updateCards(refCard);
});

refCard.onInserted.add(function (_, insertedCard, index, player) {
  console.log(
    "Inserting index " +
      index +
      "(refCard = " +
      refCard.getId() +
      ", insertedCard = " +
      insertedCard.getId() +
      ")"
  );
  if (insertedCard.data === undefined) {
    insertedCard.data = [];
  }
  refCard.data.splice(index, 0, ...insertedCard.data);
  updateCards(refCard);
});

// set methods for later use
refCard.updateCards = updateCards;
