import "./style.css";
import { enterGame,dmActor,targetTime } from "./dm.js";

// const easyButton = document.getElementById("easyButton");
// console.log("Easy button:", easyButton);
export let level_click;
export let targetTime_click;
document.addEventListener("click", function(event) {
    const target = event.target;
    if (target.matches("#easyButton")) {
        level_click = "easy";
        targetTime_click = 3 * 60 * 1000; // 3 minutes in milliseconds
        enterGame();
    } else if (target.matches("#midButton")) {
        level_click = "mid";
        targetTime_click = 1.5 * 60 * 1000; // 1.5 minutes in milliseconds
        enterGame();
    } else if (target.matches("#hardButton")) {
        level_click = "hard";
        targetTime_click = 1 * 60 * 1000; // 1 minute in milliseconds
        enterGame();
    }else if (target.matches("#playButton")) {
        dmActor.send({ type: "CLICK" });
    }
})
    
function successUtter() {
    dmActor.send({
        type: "WELLDONE"
    });
}

function wrongUtter() {
    dmActor.send({
        type: "WRONGANSWER"
    });
}

function limitUtter() {
    dmActor.send({
        type: "LIMITUSE"
    });
}

function timeupUtter() {
    dmActor.send({
        type: "TIMEUP"
    });
}

export var randomNum = [];

export var app = new Vue({
    el:'#app', // Selector
    data:{
        msg:'hello',
        randomNum:[],
        result:'',
        tempResult:'',
        flag0:false,
        flag1:false,
        flag2:false,
        flag3:false
    },

    mounted() {
        this.getRandomNum();
    },

    methods:{
        getRandomNum() {
            this.randomNum = []; // for click
            randomNum = []; // for dm
            var previousCombos = []; 
            var count = 0;
            const suits = ['hearts', 'diamonds', 'spades', 'clubs']; // or ['h', 'd', 's', 'c']

            while (this.randomNum.length < 4) { 
                var suit = randomSuit(suits);
                var num = Math.floor(Math.random() * 9 + 1);

                var rank;
                switch (num) {
                    case 1:
                        rank = 'A';
                        break;
                    default:
                        rank = num.toString();
                        break;
                } 
                var currentCombo = [suit, rank];
                if (!previousCombos.some(combo => combo[0] === suit && combo[1] === rank)) {
                    previousCombos.push(currentCombo);
                   
                    var cardCanvasId = 'cardCanvas_' + count;
                    var cardCanvas = document.getElementById(cardCanvasId).getContext('2d');
                    cardCanvas.drawPokerCard(10, 10, 180, suit, rank);
                    count++;

                    this.randomNum.push(num);
                    randomNum.push(num);
                }
            }
        
            // Check if the generated cards have a solution
            if (!this.hint()) {
                // If no solution found, regenerate cards
                this.getRandomNum();
            }
            this.result = '' // reset to '' before regenerating the deck
            
            function randomSuit(suits) {
                const randomIndex = Math.floor(Math.random() * suits.length);
                return suits[randomIndex];
            }
        },
        
        hint() {
            const opts = ["+", "-", "*", "/"];
            const len = 4;
            const aim = 24;
            let solution = '';
            this.n_solution = 0;
        
            // Generate all possible expressions
            for (let i = 0; i < len; i++) {
                for (let j = i + 1; j < len; j++) {
                    const numij = [randomNum[i], randomNum[j]];
                    const expressions = [];
        
                    for (const opt1 of opts) {
                        for (const opt2 of opts) {
                            for (const opt3 of opts) {
                                expressions.push(`(${numij[0]}${opt1}${numij[1]})${opt2}${randomNum.filter((num, idx) => idx !== i && idx !== j).join(opt3)}`);
                                expressions.push(`${numij[0]}${opt1}(${numij[1]}${opt2}${randomNum.filter((num, idx) => idx !== i && idx !== j).join(opt3)})`);
                            }
                        }
                    }
        
                    // Check whether each expression is equal to the target value
                    for (const expression of expressions) {
                        if (eval(expression) === aim) {
                            // this.n_solution++;
                            solution = expression;
                            this.result = solution;
                            return true
                        }
                    }

                    // if (this.n_solution > 0) {
                    //     // console.log(this.n_solution)
                    //     return true;
                    // }                
                }
            }
            return false;
        }, 
        
        
        getVal(num,index) {
            this.result += num;
            switch(index) {
                case 0:
                    this.flag0 = !this.flag0;
                    break;
                case 1: 
                    this.flag1 = !this.flag1;
                    break;
                case 2: 
                    this.flag2 = !this.flag2;
                    break;
                case 3: 
                    this.flag3 = !this.flag3;
                    break;
            }
            return this.result;
        },
        // reset flag
        resertFlag() {
            this.flag0 = false;
            this.flag1 = false;
            this.flag2 = false;
            this.flag3 = false;
        },

        add() {
            this.result += '+';
        },

        inc() {
            this.result += '-';
        },

        mul() {
            this.result += '*';
        },

        div() {
            this.result += '/';
        },

        left() {
            this.result += '(';
        },

        right() {
            this.result += ')';
        },

        clean() {
            this.result = '';
            this.resertFlag();
        },

        confirm() {
            try{
                var flag = this.flag0 && this.flag1 && this.flag2 && this.flag3;
                // console.log('res:',this.result);
                if (flag) {
                    // Calculate the result: directly convert the string into a js statement for execution, or use a queue to implement it
                    this.tempResult = eval(this.result);
                    if (this.tempResult === 24) {
                        this.$message.success('Success!');
                        this.result = '';
                        // this.getRandomNum();
                        stopCountdown();
                        successUtter()
                    } else{
                        this.$message.error('Your answer is wrong!');
                        this.result = '';
                        this.resertFlag();
                        wrongUtter()
                    }
                } 
                else {
                    this.$message.error('Each card needs to be used once!');
                    limitUtter()
                }
            }

            catch(err) {
                this.$message.error('Incorrect input!');
                this.result = '';
            }
        },

        resert() {
            this.getRandomNum();
            this.resertFlag();
            this.result = '';
            if(targetTime > 0){
                countDown(targetTime);
            }else if(targetTime_click > 0){
                countDown(targetTime_click);
            }
        }
    },
});

let isstopCountdown;
export function stopCountdown() {
    isstopCountdown = true;
}

let countdownTimeout; // Save a reference to the current countdown

export function countDown(time) {
    isstopCountdown = false;
    var time2;
    var time1;
    var countdownElement = document.getElementById("countdown");
    window.requestAnimationFrame(step);

    // stop previous countdown
    if (countdownTimeout) {
        clearTimeout(countdownTimeout);
    }
    
    function step() {
        function zeroFill(num) {
            return num < 10 ? "0" + num : num;
        }

        if (isstopCountdown) return;

        time1 = new Date().getTime(); // start timestamp
        if (time2 == undefined) {
            time2 = time1 + time; // end timestamp
        }

        var delta_time = time2 - time1; // ms      
        var minutes = zeroFill(Math.floor(delta_time / (60 * 1000))); // Calculate the difference in minutes
        var seconds = zeroFill(Math.floor((delta_time % (60 * 1000)) / 1000)); // Calculate the difference in seconds
        var countdownTime = minutes + ":" + seconds;

        if (countdownTime == '00:00') {
            stopCountdown();
            timeupUtter();
            return;
        } else {
            countdownElement.innerText = countdownTime;
            countdownTimeout = setTimeout(step, 1000); // update by second
        }
    }
}

window.onload = function() {
    const countdownDiv = document.getElementById('countdown');
    if(targetTime > 0){
        countDown(targetTime);
    }else if(targetTime_click > 0){
        countDown(targetTime_click);
    }
};