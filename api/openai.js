const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Function to generate chat completion
async function generateChatCompletion(transcript, aiSummary, tasks) {
  console.log("Starting OpenAI call");
    try {
    const functions = [
      {
        name: "moveCards",
        description: "Move multiple Trello cards to different lists based on the user's transcript",
        parameters: {
          type: "object",
          properties: {
            moves: {
              type: "array",
              description: "Array of card movements to perform",
              items: {
                type: "object",
                properties: {
                  cardId: {
                    type: "string",
                    description: "The ID of the card to move"
                  },
                  boardId: {
                    type: "string",
                    description: "The ID of the board containing the card"
                  },
                  listId: {
                    type: "string",
                    description: "The ID of the destination list"
                  },
                  comment: {
                    type: "string",
                    description: "A brief explanation of why the card is being moved, based on the transcript"
                  }
                },
                required: ["cardId", "boardId", "listId", "comment"]
              }
            }
          },
          required: ["moves"]
        }
      },
      {
        name: "createCards",
        description: "Create new Trello cards based on the user's transcript (maximum 3 cards per request)",
        parameters: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              description: "Array of cards to create (max 3)",
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "The name of the card to create"
                  },
                  description: {
                    type: "string",
                    description: "A detailed description for the card, based on the context from the transcript"
                  },
                  boardId: {
                    type: "string",
                    description: "The ID of the board to create the card on"
                  },
                  listId: {
                    type: "string",
                    description: "The ID of the list to create the card on"
                  }
                },
                required: ["name", "description", "boardId", "listId"]
              }
            }
          },
          required: ["cards"]
        }
      }
    ];

    const messages = [
        {
            role: "system",
            content: `You are a helpful AI Trello assistant that can both move existing cards and create new ones. When analyzing the user's transcript:

1. For existing tasks mentioned in the transcript:
   - If a task's status has changed (e.g., "completed", "started", "blocked"), use moveCards to move it to the appropriate list
   - Match task names flexibly but accurately to avoid moving the wrong cards

2. For new tasks mentioned in the transcript:
   - If you identify new tasks or todo items, use createCards to create them
   - You can create up to 3 new cards at a time
   - Place new cards in the appropriate list based on their status (e.g., "To Do", "In Progress")
   - Use clear, concise names for new cards
   - Only create cards for clearly defined tasks, not vague mentions

3. If no changes are needed, just reply with "NO CHANGES STOP TRIGGERED"

The Trello data follows this schema:
boards: [
  {
    "boardId": string,
    "name": string,
    "lists": [
      {
        "listId": string,
        "name": string,
        "cards": [
          {
            "cardId": string,
            "name": string,
            "description": string,
            "boardId": string,
            "listId": string
          }
        ]
      }
    ]
  }
]`
        },
        {
            role: "user",
            content: `Here are the user's transcript ${transcript} and AI summary ${JSON.stringify(aiSummary)}.`
        },
        {
            role: "user",
            content: `Here is the user's Trello tasks ${JSON.stringify(tasks)}.`
        }
    ]


    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      functions,
      function_call: "auto",
      temperature: 0.7,
      max_tokens: 500,
      stop: ["NO CHANGES STOP TRIGGERED"]
    });

    const response = completion.choices[0].message;
    // Initialize result with empty arrays
    const result = {
      success: true,
      shouldMove: false,
      shouldCreate: false,
      moveDetails: [],
      createDetails: []
    };

    // Handle function calls
    if (response.function_call) {
      try {
        const functionArgs = JSON.parse(response.function_call.arguments);
        
        if (response.function_call.name === 'moveCards') {
          result.shouldMove = true;
          result.moveDetails = functionArgs.moves || [];
        } 
        if (response.function_call.name === 'createCards') {
          result.shouldCreate = true;
          result.createDetails = functionArgs.cards || [];
        }
      } catch (error) {
        console.error('Error parsing function arguments:', error);
      }
    }

    return result;

  } catch (error) {
    console.error('OpenAI API error:', error.message);
    throw new Error('Failed to generate chat completion');
  }
}

module.exports = {
  generateChatCompletion
}; 