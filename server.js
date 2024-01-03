const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 3000 });
const ipToUserIdMap = new Map();
const userList = new Map();

const roleta1 = 0;
const roleta2 = 0;

const betMaxValue = 1000;
const betMinValue = 1.0; 

const multiplierValues = [2.0, 2.1, 2.2, 2.3, 2.4, 2.5];
const multiplierDraw = [10, 15, 20, 30, 40];

let gameState = {
  roundInProgress: false,
  timeRemaining: 6,
  timeWaiting: 5,
  multiplierLuva: 0.0,
  multiplierFalcon: 0.0,
  multiplierDraw: 0,
  roleta1,
  roleta2,
  bets: [],
};
let gameSettings = {
  betMaxValue,
  betMinValue,
  multiplierValues,
  multiplierDraw,
};

function startRound() {
  console.log('Aguardando Apostas...');

  const roundInterval = setInterval(() => {
    if (gameState.timeWaiting > 0) {
      console.log('Aguardando: ', gameState.timeWaiting);
      gameState.timeWaiting--;
    } else {
      if (gameState.timeRemaining >= 6) {
        startingRoulette();
        console.log('Iniciando rodada');
        gameState.roleta1 = Math.floor(Math.random() * 21);
        gameState.roleta2 = Math.floor(Math.random() * 21);
        const indexDraw = Math.floor(Math.random() * multiplierDraw.length);
        const indexFalcon = Math.floor(Math.random() * multiplierValues.length);
        const indexLuva = Math.floor(Math.random() * multiplierValues.length);
        gameState.multiplierDraw = multiplierDraw[indexDraw];
        gameState.multiplierLuva = multiplierValues[indexLuva];
        gameState.multiplierFalcon = multiplierValues[indexFalcon];
      }
      
      console.log('Tempo restante: ', gameState.timeRemaining);
      if (gameState.timeRemaining <= 0) {
        gameState.timeRemaining = 6;
        gameState.timeWaiting = 5;
        clearInterval(roundInterval);
        processBets();
        endRound();
        setTimeout(() => {
          startRound();
        }, 5000);
        return;
      }
      gameState.timeRemaining--;
      //broadcastGameState(); chama a cada segundo
    }
  }, 1000);

  broadcastGameState();
}

function processBets() {
  console.log('Processando apostas');
  const totalBets = gameState.bets.reduce((total, bet) => total + bet.amount, 0);
  const roleta1Max = gameState.roleta1;
  const roleta2Max = gameState.roleta2;

  gameState.bets.forEach((bet) => {
    const roletaMax = bet.betOn === 1 ? roleta1Max : roleta2Max;
    const user = userList.get(bet.userId);

    if (roletaMax === bet.selectedNumber) {
      // Usuário acertou, atualize o saldo (pode adicionar lógica específica aqui)
      const percentageOfTotalBets = (bet.amount / totalBets) * 100;
      const winnings = (percentageOfTotalBets / 100) * totalBets * 2; // Ganho dobrado se acertar o número maior
      user.balance += winnings;

      // Log do ganho
      console.log(`Usuário ${bet.userId} ganhou ${winnings}. Novo saldo: ${user.balance}`);
    } else {
      user.balance -= bet.amount;
      // Log da perda
      console.log(`Usuário ${bet.userId} perdeu ${bet.amount}. Novo saldo: ${user.balance}`);
    }
  });
}

function endRound() {
  sendRouletteNumber(gameState.roleta1, gameState.roleta2);
  console.log('Exibindo números da roleta');
  console.log('Roleta 1: ', gameState.roleta1);
  console.log('Roleta 2: ', gameState.roleta2);
  gameState.roundInProgress = false;

  const totalBets = gameState.bets.reduce((total, bet) => total + bet.amount, 0);
  const roleta1Max = gameState.roleta1;
  const roleta2Max = gameState.roleta2;

  const winners = gameState.bets.filter((bet) => {
    const roletaMax = bet.betOn === 1 ? roleta1Max : roleta2Max;
    return roletaMax === bet.selectedNumber;
  });

  winners.forEach((winner) => {
    const user = userList.get(winner.userId);
    const percentageOfTotalBets = (winner.amount / totalBets) * 100;
    const winnings = (percentageOfTotalBets / 100) * totalBets * 2; // Ganho dobrado se acertar o número maior

    // Adiciona os ganhos ao saldo do usuário
    user.balance += winnings;
    
    // Log dos ganhos
    console.log(`Usuário ${winner.userId} ganhou ${winnings}. Novo saldo: ${user.balance}`);
  });

  broadcastGameState();
}

function broadcastGameState() {
  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const messageObject = {
        MessageType: "GameInfo",
        Data: gameState
      };
      const messageString = JSON.stringify(messageObject);
      client.send(messageString);
    }
  });
}
function startingRoulette() {
  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const messageObject = {
        MessageType: "StartRound"
      };
      const messageString = JSON.stringify(messageObject);
      client.send(messageString);
    }
  });
}
function sendRouletteNumber(number1, number2) {
  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const messageObject = {
        MessageType: "SetRouletteNumber",
        Data: {number1, number2}
      };
      const messageString = JSON.stringify(messageObject);
      client.send(messageString);
    }
  });
}

server.on('connection', (socket, req) => {
  const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  let userId = ipToUserIdMap.get(userIp);

  if (!userId) {
    userId = generateUniqueId();
    ipToUserIdMap.set(userIp, userId);
    userList.set(userId, { userId: userId, name: "", balance: 5000 });
  }
  console.log(`Usuário ${userId} conectado`);
  const currentUser = userList.get(userId);
  const messageObject = {
    MessageType: "Connected",
    Data: currentUser
  };
  const gameSettingsObject = {
    MessageType: "GameSettings",
    Data: gameSettings
  };
  socket.send(JSON.stringify(gameSettingsObject));
  socket.send(JSON.stringify(messageObject));
  //console.log(`Enviando estado do jogo para o usuário ${JSON.stringify(gameState)}`);
  socket.on('message', (message) => {
    const data = JSON.parse(message);

    /*if (data.type === 'bet' && gameState.roundInProgress && gameState.timeRemaining > 10) {
        const betAmount = data.amount || 0;
        const betOn = data.betOn || 1; // Assume roleta 1 como padrão
  
        if (userList.get(userId).balance >= betAmount) {
          // Verifica a aposta do usuário
          const roletaResult = gameState[`roleta${betOn}`][gameState.roletaIndex];
          const userBetWon = roletaResult === Math.max(...gameState[`roleta${betOn}`]);
  
          // Atualiza o saldo do usuário com base no resultado da aposta
          userList.get(userId).balance += userBetWon ? betAmount * 2 : (roletaResult === gameState[`roleta${betOn}`][1] ? betAmount : 0);
  
          // Log da aposta
          console.log(`Usuário ${userId} apostou ${betAmount} na roleta ${betOn} e ${userBetWon ? 'ganhou' : 'perdeu'}. Novo saldo: ${userList.get(userId).balance}`);
  
          // Atualiza o estado do jogo e envia para todos os usuários
          broadcastGameState();
        } else {
          // Saldo insuficiente
          console.log(`Usuário ${userId} tentou apostar, mas não possui saldo suficiente.`);
        }
      }*/
  });
});
function generateUniqueId() {
    return Math.random().toString(36).substring(7);
}
// Inicia a primeira rodada quando o servidor é iniciado
startRound();