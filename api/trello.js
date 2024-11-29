const axios = require('axios');
require('dotenv').config();

const TRELLO_BASE_URL = 'https://api.trello.com/1';
const { TRELLO_KEY } = process.env;

// Check if token is valid by making a test API call
async function isTokenValid(token) {
  try {
    await axios.get(
      `${TRELLO_BASE_URL}/members/me?key=${TRELLO_KEY}&token=${token}`
    );
    return true;
  } catch (error) {
    return false;
  }
}

// Create a new card
async function createCard(userToken, { name, boardId, listId, description }, tasks) {
  try {
    const board = tasks.boards.find(b => b.boardId === boardId);
    const list = board?.lists.find(l => l.listId === listId);
    const listName = list?.name || 'Unknown List';
    const boardName = board?.name || 'Unknown Board';

    const response = await axios.post(
      `${TRELLO_BASE_URL}/cards?key=${TRELLO_KEY}&token=${userToken}`,
      {
        name,
        idBoard: boardId,
        idList: listId,
        desc: description || ''
      }
    );

    return {
      success: true,
      card: {
        id: response.data.id,
        name: response.data.name,
        listId: response.data.idList,
        listName: listName,
        boardId: response.data.idBoard,
        boardName: boardName
      }
    };
  } catch (error) {
    console.error('Error creating card:', error.message);
    throw new Error('Failed to create card');
  }
}

// Move a card to a different list
async function moveCard(userToken, { cardId, boardId, listId, comment }, tasks) {
  try {
    // Get board and list names from tasks data
    console.log(tasks,boardId, listId,comment)
    const board = tasks.boards.find(b => b.boardId === boardId);
    const list = board?.lists.find(l => l.listId === listId);
    const listName = list?.name || 'Unknown List';
    const boardName = board?.name || 'Unknown Board';

    // Move the card
    const response = await axios.put(
      `${TRELLO_BASE_URL}/cards/${cardId}?key=${TRELLO_KEY}&token=${userToken}`,
      {
        idList: listId,
        idBoard: boardId
      }
    );

    // Add comment if provided
    if (comment) {
      await axios.post(
        `${TRELLO_BASE_URL}/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${userToken}`,
        {
          text: `Trellomi: ${comment}`
        }
      );
    }

    return {
      success: true,
      card: {
        id: response.data.id,
        name: response.data.name,
        listId: response.data.idList,
        listName: listName,
        boardId: response.data.idBoard,
        boardName: boardName
      }
    };
  } catch (error) {
    console.error('Error moving card:', error.message);
    throw new Error('Failed to move card');
  }
}

// Get all uncompleted tasks for a user
async function getTrelloTasks(userToken) {
  try {
    // First get all boards for the user
    const boardsResponse = await axios.get(
      `${TRELLO_BASE_URL}/members/me/boards?key=${TRELLO_KEY}&token=${userToken}`
    );

    // Get all cards from all boards with their lists
    const boardsWithCards = [];

    for (const board of boardsResponse.data) {
      // Get lists for this board
      const listsResponse = await axios.get(
        `${TRELLO_BASE_URL}/boards/${board.id}/lists?key=${TRELLO_KEY}&token=${userToken}`
      );
      
      // Get cards for this board
      const cardsResponse = await axios.get(
        `${TRELLO_BASE_URL}/boards/${board.id}/cards?key=${TRELLO_KEY}&token=${userToken}`
      );

      // Create a map of list IDs to list names and track states
      const listMap = {};
      const states = listsResponse.data.map(list => ({
        listName: list.name,
        listId: list.id
      }));

      listsResponse.data.forEach(list => {
        listMap[list.id] = {
          listId: list.id,
          name: list.name,
          cards: []
        };
      });

      // Filter and organize cards by lists
      cardsResponse.data
        .filter(card => !card.closed && (!card.dueComplete || card.dueComplete === false))
        .forEach(card => {
          const cardData = {
            cardId: card.id,
            name: card.name,
            description: card.desc,
            boardId: board.id,
            listId: card.idList,
          };

          // Add card to its list
          if (listMap[card.idList]) {
            listMap[card.idList].cards.push(cardData);
          }
        });

      // Add board data with its lists, cards, and states
      boardsWithCards.push({
        boardId: board.id,
        name: board.name,
        lists: Object.values(listMap),
        states: states
      });
    }

    return {
      success: true,
      boards: boardsWithCards
    };
  } catch (error) {
    console.error('Error fetching Trello tasks:', error.message);
    throw new Error('Failed to fetch Trello tasks');
  }
}

// Generate Trello auth URL
function generateAuthUrl(uid) {
  return `https://trello.com/1/authorize?` + 
    `expiration=never&` +
    `name=YourAppName&` +
    `scope=read,write,account&` +
    `response_type=token&` +
    `key=${TRELLO_KEY}&` +
    `return_url=http://192.168.0.150:3000/callback?uid=${uid}`;
}

module.exports = {
  getTrelloTasks,
  generateAuthUrl,
  isTokenValid,
  moveCard,
  createCard
}; 