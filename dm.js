import { assign, createActor, setup, } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure.js";
import { randomNum,countDown,app,stopCountdown,targetTime_click } from "./main.js";


const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
    endpoint: "https://languge-resource-xiumei.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2022-10-01-preview" /** your Azure CLU prediction URL */,
    key: NLU_KEY /** reference to your Azure CLU key */,
    deploymentName: "finalproject" /** your Azure CLU deployment */,
    projectName: "finalproject" /** your Azure CLU project name */,
};  

const settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000, // default value
  locale: "en-US",
  // ttsDefaultVoice: "en-US-DavisNeural",
  ttsDefaultVoice: "en-US-AvaNeural",
};

export let targetTime;// why not 0: avoid timeupUtter at start

const dmMachine = setup({
  devTools: true,
  actions: {
    say: ({ context }, params) => sendSpeechCommand(context.ssRef, "SPEAK", params),
    startTimer: () => {
      setTimeout(() => {
        dmActor.send({ type: "TIMER_EXPIRED" });
      }, 3000);// 3s limit
    },
    clearFields: assign({ counter: 0 }),
    enterGame: () => enterGame(),
    countDown: ({ context }) => countDown(context.targetTime),
    resert: () => app.resert(),
    hint: () => app.hint(),
    stopCountdown: () => stopCountdown(),
  }
}).createMachine({
  context: {
    level: null,
    targetTime: targetTime,
    counter: 0
  },
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: [
        assign({ ssRef: ({ spawn }) => spawn(speechstate, { input: settings }) }),
        ({ context }) => sendSpeechCommand(context.ssRef, "PREPARE"),
        "startTimer",
      ],
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      entry: "startTimer",
      on: {
        CLICK: "Main",
        TIMER_EXPIRED: "Main", // Handle inactivity event
      },
    },
    successUtter: {
      entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Well done! You solved it!"),
      on: { SPEAK_COMPLETE: "#DM.Main.RetryPrompt" }
    },
    wrongUtter: {
      entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "sorry, your answer is wrong"),
      on: { SPEAK_COMPLETE: "#DM.Main.autoasksolved" }
    },
    limitUtter: {
      entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "sorry, each card needs to be used once"),
      on: { SPEAK_COMPLETE: "#DM.Main.autoasksolved" }
    },
    timeupUtter: {
      entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Time up!"),
      on: { SPEAK_COMPLETE: "#DM.Main.RetryPrompt" }
    },
    NoInput: {
      entry: ( {context} ) =>
        context.ssRef.send({
                      type: "SPEAK",
                      value: {
                        utterance: "Sorry, I didn't hear you.",
                      },
      }),
      on: {
            SPEAK_COMPLETE:
              [
                {   guard: ({context}) => context.counter < 5,   
                    target: "Main.hist",
                    actions: assign({ counter: ({ context }) => context.counter + 1 })
                },// control the times of reprompt
                {   guard: ({context}) => context.counter >= 5,   
                    target: "#DM.DONE",
                    actions: [ assign({ counter: ({ context }) => context.counter + 1 }),
                      ({ context, event }) =>
                      context.ssRef.send({
                        type: "SPEAK",
                        value: {
                          utterance: `I will end our conversation`,
                        },
                      }),
                    ]
                },
              ],  
        }
    },
    Main: { 
      initial: "Greeting",
      on: { ASR_NOINPUT: "#DM.NoInput",// Handle ASR_NOINPUT event
            WELLDONE: "#DM.successUtter",
            WRONGANSWER:"#DM.wrongUtter",
            LIMITUSE:"#DM.limitUtter",
            TIMEUP: "#DM.timeupUtter"// Transfer alert message to utterance
          },
      states: {
        hist: {
          type: 'history',
          history: 'shallow' // optional; default is 'shallow'
        },
        Greeting:{
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "welcome to '24 Points' game"),
          on: { SPEAK_COMPLETE: "ruleIntroduction" },
        },
        ruleIntroduction:{
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "You will be given 4 random cards from 1 to 9, and three entry levels vary. You can use addition, subtraction, multiplication, and division to generate a result of 24. Each card should only be used once. Decimal, fraction or negative number can appear during operations. Also, a timer will be set according to your chosen level. If you can get 24 in limited time, you win, or you fail. "),
          on: { SPEAK_COMPLETE: "TopPrompt" },
        }, 
        TopPrompt: { 
          initial: "Prompt",
          states: {
            Prompt:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Are you ready?"),
              on: { SPEAK_COMPLETE: "StartConfirm" },
            },        
            StartConfirm: {
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: { 
                RECOGNISED: [
                  { target: "#DM.Main.TransTochooseLevel",
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'accept',
                  },
                  { target: "WaitStart" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'decline',
                  },
                  { target: "#DM.Main.TopPrompt.ReIntentIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'accept' && event.nluValue?.entities?.[0]?.category !== 'decline',
                  }
                ]
              }
            },
            WaitStart:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "That's fine. I can wait for you."),
              after:{
                10000: {
                  target: "Prompt"
                },
              }
            },
            ReIntentIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please say 'yes' or 'no'"),
              on: { SPEAK_COMPLETE: "Prompt" },
            }, 
          }
        },
        TransTochooseLevel: {
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Great!`),
          on: {
            SPEAK_COMPLETE:"chooseLevel",
            },
        },
        chooseLevel: { 
          initial: "askLevel",
          states: {
            askLevel:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Which level would you like to try?"),
              on: { SPEAK_COMPLETE: "levelConfirm" },
            },        
            levelConfirm: {
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: { 
                RECOGNISED: [
                  { target: "#DM.Main.startPlay" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'level' && (event.nluValue?.entities?.[0].text.toLowerCase() === 'easy' || event.nluValue?.entities?.[0].text.toLowerCase() === 'simple'),
                    actions: [ 
                      assign({ level: ({context, event}) => event.nluValue?.entities?.[0].text }),
                      assign({ targetTime: ({context}) => 180 * 1000 }),
                      "resert"
                     // ({event}) => console.log(event.nluValue)
                    ],
                  },
                  { target: "#DM.Main.startPlay" , 
                  guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'level' && (event.nluValue?.entities?.[0].text.toLowerCase() === 'medium' || event.nluValue?.entities?.[0].text.toLowerCase() === 'mid'),
                  actions: [ assign({ level: ({context, event}) => event.nluValue?.entities?.[0].text }),
                             assign({ targetTime: ({context}) => 90 * 1000 }),
                             "resert"
                            ],
                  },
                  { target: "#DM.Main.startPlay" , 
                  guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'level' && (event.nluValue?.entities?.[0].text.toLowerCase() === 'hard' || event.nluValue?.entities?.[0].text.toLowerCase() === 'difficult'),
                  actions: [ assign({ level: ({context, event}) => event.nluValue?.entities?.[0].text }),
                             assign({ targetTime: ({context}) => 60 * 1000 }),
                             "resert"
                            ]
                  },
                  { target: "#DM.Main.chooseLevel.ReLevelIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'level'|| (event.nluValue?.entities?.[0]?.category === 'level' && !['easy','simple','medium','mid','hard','difficult'].includes(event.nluValue?.entities?.[0].text.toLowerCase()))
                  }
                ]
              }
            },
            ReLevelIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please answer like 'I want to try the easy level'"),
              on: { SPEAK_COMPLETE: "askLevel" },
            }, 
          }
        },
        startPlay: {
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Okay. Let's begin."),
          on: { SPEAK_COMPLETE: { target:"readCards", actions:["enterGame", "countDown" ] }}
        },
        readCards:{
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Now we have four cards: ${randomNum}.`),
          on: { SPEAK_COMPLETE: "playGamePrompt" },
        },
        playGamePrompt:{
          initial: "changeCards",
          states: {
            changeCards: {
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Do you want to change the cards?`),
              on: { SPEAK_COMPLETE: "confirmChange" },
            },
            confirmChange: {
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: {
                RECOGNISED: [
                  { target: "rereadCards",
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'accept',
                    actions: [ "resert", "countDown" ]
                  },
                  { target: "TransToOperate" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'decline',
                  },
                  { target: "#DM.Main.playGamePrompt.ReifChangeIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'accept' && event.nluValue?.entities?.[0]?.category !== 'decline',
                  }
                ]
              },
            },
            rereadCards:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Ok, now you have four new cards: ${randomNum}.`),
              on: { SPEAK_COMPLETE: "StartOperate"}
            },
            TransToOperate:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `ok`),
              on: { SPEAK_COMPLETE: "StartOperate" },
            },
            StartOperate:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `you can start to figure out the solution.`),
              on: { SPEAK_COMPLETE: "#DM.Main.autoasksolved" },
            },
            ReifChangeIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please say 'yes' or 'no'"),
              on: { SPEAK_COMPLETE: "changeCards" },
            }
          }
        },
        autoasksolved:{
          after:{
            20000: {
              actions: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Have you thought of a solution?`),
            },
          },
          on: { SPEAK_COMPLETE: "SolutionPrompt.issolved" },
        },
        SolutionPrompt: {
          initial:"asksolved",
          states:{
            asksolved:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Have you thought of a solution?`),
              on: { SPEAK_COMPLETE: "issolved" }
            },
            issolved:{
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: {
                RECOGNISED: [
                  { target: "#DM.Main.encourageUtter",
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'accept',
                  },
                  { target: "#DM.Main.HintPrompt.askhint" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'decline',
                  },
                  { target: "ReifsolvedIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'accept' && event.nluValue?.entities?.[0]?.category !== 'decline',
                  }
                ]
              },
            },
            ReifsolvedIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please say 'yes' or 'no'"),
              on: { SPEAK_COMPLETE: "asksolved" },
            }
          }
        },
        autoaskhint:{
          after:{
            30000: {
              actions: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Do you want a hint?`),
            }
          },
          on: { SPEAK_COMPLETE: "HintPrompt.ishint" }
        },
        HintPrompt: {
          initial:"askhint",
          states:{
            askhint:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", `Do you want a hint?`),
              on: { SPEAK_COMPLETE: "ishint" }
            },
            ishint:{
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: {
                RECOGNISED: [
                  { target: "showhint",
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'accept',
                    actions: ["hint", "stopCountdown"]
                  },
                  { target: "#DM.Main.encourageUtter" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'decline',
                  },
                  { target: "ReifhintIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'accept' && event.nluValue?.entities?.[0]?.category !== 'decline',
                  }
                ]
              },
            },
            ReifhintIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please say 'yes' or 'no'"),
              on: { SPEAK_COMPLETE: "askhint" },
            },
            showhint:{
              after: {
                1000: { 
                  actions: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Now you can see the answer") 
                }
              },
              on: { SPEAK_COMPLETE: "#DM.Main.RetryPrompt" },
            },
          }
        },
        encourageUtter:{
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Ok, I am looking forward to your answer."),
          on: { SPEAK_COMPLETE: "autoaskhint" },
        },
        RetryPrompt: {
          initial:"askretry",
          states:{
            askretry:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Do you want to try a new deck?"),
              on: { SPEAK_COMPLETE: "isretry" },
            },
            isretry:{
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: {
                RECOGNISED: [
                  { target: "#DM.Main.playGamePrompt.rereadCards",
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'accept',
                    actions: ["resert", "countDown"]
                  },
                  { target: "#DM.Main.TranstoRelevel" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'decline',
                  },
                  { target: "ifretryIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'accept' && event.nluValue?.entities?.[0]?.category !== 'decline',
                  }
                ]
              },
            },
            ifretryIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please say 'yes' or 'no'"),
              on: { SPEAK_COMPLETE: "askretry" },
            },
          }
        },
        TranstoRelevel:{
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "right"),
          on: { SPEAK_COMPLETE: "RelevelPrompt" },
        },
        RelevelPrompt: {
          initial:"askrelevel",
          states:{
            askrelevel:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "do you want to try a new level?"),
              on: { SPEAK_COMPLETE: "isrelevel" },
            },
            isrelevel:{
              entry: ({ context }) => context.ssRef.send({ type: "LISTEN", value: { nlu: true }}),
              on: {
                RECOGNISED: [
                  { target: "#DM.Main.chooseLevel",
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'accept'
                  },
                  { target: "#DM.Main.gameCompleted" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category === 'decline',
                  },
                  { target: "ifrelevelIdentify" , 
                    guard: ({event}) => event.nluValue?.entities?.[0]?.category !== 'accept' && event.nluValue?.entities?.[0]?.category !== 'decline',
                  }
                ]
              },
            },
            ifrelevelIdentify:{
              entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "Sorry, I didn't understand you. I need to clarify your answer. Please say 'yes' or 'no'"),
              on: { SPEAK_COMPLETE: "askrelevel" },
            },
          }
        },
        gameCompleted: {
          entry: ({ context }) => sendSpeechCommand(context.ssRef, "SPEAK", "ok, game over! Hope you enjoy your time!"),
          SPEAK_COMPLETE: "#DM.Done"
      },   
      }
    },
    DONE: {
        on: { CLICK: "#DM.Main" }
    }
  }
});

export const dmActor = createActor(dmMachine, { inspect: inspector.inspect }).start();

dmActor.subscribe((state) => {
  // targetTime = state.context.targetTime; // always reflects the latest state of the targetTime value in the dmActor
  console.log(state)
});

export function enterGame() {
  hideModules(startmoduleIds);
  showModules(gamemoduleIds);
  if (targetTime > 0) {
    countDown(targetTime);
  } else if (targetTime_click > 0) {
    countDown(targetTime_click);
  }
}

// Declare a global variable containing the ID of the element to be operated on
const startmoduleIds = ["easyButton", "midButton", "hardButton", "gameIntro", "ruready"];
const gamemoduleIds = ["resultDisplay", "cardModule", "operatorModule", "settingModule", "countdown"];

function hideModules(ids) {
  ids.forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
}

function showModules(ids) {
  ids.forEach(id => {
    document.getElementById(id).classList.remove("hidden");
  });
}

function sendSpeechCommand(ssRef, type, utterance) {
  ssRef.send({ type, value: { utterance } });
}