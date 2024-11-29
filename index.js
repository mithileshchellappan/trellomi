const express = require('express');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const { storeUserToken, getUserToken, isRequestProcessed, markRequestProcessed } = require('./db/database');
const { getTrelloTasks, generateAuthUrl, isTokenValid, moveCard, createCard } = require('./api/trello');
const { generateChatCompletion } = require('./api/openai');

const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Serve the login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  req.session.uid = uid;
  const loginUrl = generateAuthUrl(uid);
  res.redirect(loginUrl);
});

app.get('/callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

app.post('/store-token', async (req, res) => {
  const { token, uid } = req.body;
  console.log("Storing token for user:", uid);

  if (!token || !uid) {
    return res.status(400).json({ error: 'Token and User ID are required' });
  }

  try {
    await storeUserToken(uid, token);
    req.session.userToken = token;
    res.json({ success: true });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to store token' });
  }
});

app.post('/webhook/memory', async (req, res) => {
  try {
    const {uid} = req.query;
    const { structured: { title, overview }, transcript_segments, id } = req.body;
    
    // const isProcessed = await isRequestProcessed(id);
    // if (isProcessed) {
    //   return res.json({
    //     success: true,
    //     message: 'Request already processed',
    //     alreadyProcessed: true
    //   });
    // }

    await markRequestProcessed(id);

    const transcript = transcript_segments.map(segment => segment.text).join('\n');
    const aiSummary = { title, overview };

    if (!uid) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if(title.length < 0 && overview.length < 0){
      return res.send('No changes were needed based on the conversation.');
    }
    console.log(`Title: ${title} Overview: ${overview}`);
    // Get user's Trello token
    const userToken = await getUserToken(uid);
    if (!userToken) {
      return res.status(401).json({ error: 'Trello token not found or expired' });
    }

    const tasks = await getTrelloTasks(userToken);
    if(title.length < 0 && overview.length < 0){
      return res.send('No changes were needed based on the conversation.');
    }
    // Get AI suggestions for card movements and creation
    const suggestion = await generateChatCompletion(transcript, aiSummary, tasks);

    // If no actions suggested, return early
    if (!suggestion.shouldMove && !suggestion.moveDetails?.length && !suggestion.createDetails?.length) {
      return res.send('No changes were needed based on the conversation.');
    }

    const changes = {
      moved: [],
      created: []
    };

    // Process card movements with comments
    if (suggestion.moveDetails?.length > 0) {
      for (const moveDetail of suggestion.moveDetails) {
        console.log(moveDetail)
        const result = await moveCard(userToken, moveDetail, tasks);
        changes.moved.push(result);
      }
    }

    // Process card creations with descriptions
    if (suggestion.createDetails?.length > 0) {
      for (const createDetail of suggestion.createDetails) {
        console.log(createDetail)
        const result = await createCard(userToken, createDetail, tasks);
        changes.created.push(result);
      }
    }

    // Generate a structured summary text
    const generateSummaryText = (changes) => {
      let summaryText = `Based on the conversation, I've made the following changes:\n\n`;
      
      // Summarize moved cards
      if (changes.moved.length > 0) {
        const movesByBoardAndList = {};
        
        // Group by board and list
        changes.moved.forEach(move => {
          const { card } = move;
          const key = `${card.boardName}|||${card.listName}`;
          if (!movesByBoardAndList[key]) {
            movesByBoardAndList[key] = [];
          }
          movesByBoardAndList[key].push(card.name);
        });

        summaryText += `Moved Cards:\n`;
        for (const [key, cards] of Object.entries(movesByBoardAndList)) {
          const [boardName, listName] = key.split('|||');
          summaryText += `${listName} (${boardName}):\n`;
          cards.forEach(cardName => {
            summaryText += `- ${cardName}\n`;
          });
          summaryText += '\n';
        }
      }

      // Summarize created cards
      if (changes.created.length > 0) {
        const createsByBoardAndList = {};
        
        // Group by board and list
        changes.created.forEach(result => {
          const { card } = result;
          const key = `${card.boardName}|||${card.listName}`;
          if (!createsByBoardAndList[key]) {
            createsByBoardAndList[key] = [];
          }
          createsByBoardAndList[key].push(card.name);
        });

        summaryText += `Created Cards:\n`;
        for (const [key, cards] of Object.entries(createsByBoardAndList)) {
          const [boardName, listName] = key.split('|||');
          summaryText += `${listName} (${boardName}):\n`;
          cards.forEach(cardName => {
            summaryText += `- ${cardName}\n`;
          });
          summaryText += '\n';
        }
      }

      return summaryText.trim();
    };
    const resTest = generateSummaryText(changes);
    console.log(resTest);
    res.send(resTest);

  } catch (error) {
    console.error('Error processing memory webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process memory and update Trello',
      details: error.message 
    });
  }
});

app.get('/done', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  try {
    const userToken = await getUserToken(uid);
    if (!userToken) {
      return res.json({ is_setup_completed: false });
    }

    const isValid = await isTokenValid(userToken);
    console.log("Done check for uid:", uid, "Setup completed:", isValid);
    
    res.json({
      is_setup_completed: isValid
    });
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

app.get('/uncompleted-cards', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const userToken = await getUserToken(uid);
    if (!userToken) {
      return res.status(401).json({ error: 'Token not found or expired' });
    }

    const tasks = await getTrelloTasks(userToken);
    res.json(tasks);

  } catch (error) {
    console.error('Error fetching uncompleted cards:', error.message);
    res.status(500).json({ error: 'Failed to fetch uncompleted cards' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});