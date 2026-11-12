import { formatScore } from './game.js';
import { PORTFOLIO_URL } from './config.js';

const NAME_PATTERN = /^[\p{L}\p{N} ._'-]+$/u;
const MENU_BOARD_SIZE = 5;

const cleanName = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ');

function nameProblem(name) {
  if (name.length < 2 || name.length > 20) return 'Use 2 to 20 characters.';
  if (!NAME_PATTERN.test(name)) return "Use letters, numbers, spaces and . _ ' - only.";
  return null;
}

// Fills a leaderboard list. Names come from other players, so they only ever go in as text.
function renderBoard(list, rows) {
  list.replaceChildren(...rows.map((row, i) => {
    const item = document.createElement('li');
    if (row.you) item.className = 'you';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(i + 1);
    const who = document.createElement('span');
    who.className = 'who';
    const name = document.createElement('b');
    name.textContent = row.name;
    who.append(name);
    if (row.place) {
      const place = document.createElement('small');
      place.textContent = row.place;
      who.append(place);
    }
    const score = document.createElement('span');
    score.className = 'pts';
    score.textContent = formatScore(row.score);
    item.append(rank, who, score);
    return item;
  }));
}

// Menu, results and feedback screens, and the link between them and the server.
export function createUi({ api, game, audio }) {
  const $ = (id) => document.getElementById(id);
  const nameInput = $('playerName'), startBtn = $('startBtn'), nameError = $('nameError');
  const feedbackForm = $('feedbackForm'), feedbackSend = $('feedbackSend'), feedbackStatus = $('feedbackStatus');
  const feedbackHome = $('feedbackHome'), dialog = $('feedbackDialog');
  const stars = [...document.querySelectorAll('#stars button')];
  let playIdPromise = Promise.resolve(null), lastPlayId = null, rating = 0, feedbackSent = false;

  function showWelcome() {
    const name = api.player?.name;
    if (name) nameInput.value = name;
    $('welcome').textContent = name ? `Welcome back, ${name}.` : '';
    $('welcome').hidden = !name;
  }

  async function refreshMenuBoard() {
    const rows = await api.leaderboard();
    $('menuFeedbackBtn').hidden = !api.online || !api.player?.playerId || feedbackSent;
    $('menuBoardWrap').hidden = rows === null;
    if (rows === null) return;
    $('menuBoardEmpty').hidden = rows.length > 0;
    renderBoard($('menuBoard'), rows.slice(0, MENU_BOARD_SIZE));
  }

  function begin() {
    lastPlayId = null;
    playIdPromise = api.startRound();
    game.start();
  }

  $('nameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    audio.unlock();
    const name = cleanName(nameInput.value);
    const problem = nameProblem(name);
    nameError.textContent = problem ?? '';
    nameError.hidden = !problem;
    if (problem) {
      nameInput.focus();
      return;
    }
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    const result = await api.register(name);
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
    if (!result.ok) {
      nameError.textContent = result.error;
      nameError.hidden = false;
      return;
    }
    nameInput.blur();
    begin();
  });
  nameInput.addEventListener('input', () => { nameError.hidden = true; });

  $('againBtn').addEventListener('click', begin);
  $('restartBtn').addEventListener('click', begin);
  $('menuBtn').addEventListener('click', () => {
    game.toMenu();
    showWelcome();
    refreshMenuBoard();
  });

  // --- feedback: shown on the results screen, and from the menu in a dialog
  function setRating(value) {
    rating = value;
    stars.forEach((star, i) => star.setAttribute('aria-checked', String(i < value)));
    feedbackSend.disabled = rating === 0;
  }
  stars.forEach((star, i) => star.addEventListener('click', () => setRating(i + 1)));

  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!rating) return;
    feedbackSend.disabled = true;
    feedbackStatus.textContent = 'Sending…';
    const result = await api.feedback(rating, $('feedbackText').value, lastPlayId);
    if (!result.ok) {
      feedbackStatus.textContent = result.error;
      feedbackSend.disabled = false;
      return;
    }
    feedbackSent = true;
    feedbackStatus.textContent = 'Thanks! Your feedback was sent.';
    $('feedbackText').value = '';
    setRating(0);
    $('menuFeedbackBtn').hidden = true;
    if (dialog.open) setTimeout(() => dialog.close(), 1200);
  });

  $('menuFeedbackBtn').addEventListener('click', () => {
    feedbackStatus.textContent = '';
    dialog.querySelector('.dialog-body').append(feedbackForm);
    feedbackForm.hidden = false;
    dialog.showModal();
  });
  dialog.addEventListener('close', () => feedbackHome.append(feedbackForm));
  $('closeFeedback').addEventListener('click', () => dialog.close());

  // --- sound
  const muteBtn = $('muteBtn'), musicBtns = [...document.querySelectorAll('.music-toggle')];
  function showSound() {
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
    muteBtn.title = audio.muted ? 'Sound off (M)' : 'Sound on (M)';
    for (const b of musicBtns) {
      b.setAttribute('aria-pressed', String(audio.musicOn));
      b.textContent = audio.musicOn ? '♫ Music on' : '♫ Music off';
    }
  }
  function toggleMute() {
    audio.unlock();
    audio.setMuted(!audio.muted);
    showSound();
  }
  muteBtn.addEventListener('click', toggleMute);
  for (const b of musicBtns) {
    b.addEventListener('click', () => {
      audio.unlock();
      audio.setMusic(!audio.musicOn);
      showSound();
    });
  }

  const embedded = window.self !== window.top;
  if (PORTFOLIO_URL && !embedded) {
    $('backLink').href = PORTFOLIO_URL;
    $('backLink').hidden = false;
  }
  showWelcome();
  showSound();
  refreshMenuBoard();

  return {
    toggleMute,
    playAgain: begin,
    get dialogOpen() { return dialog.open; },

    async roundOver(result) {
      const online = Boolean(api.player?.playerId);
      const standing = $('standing');
      standing.textContent = online ? 'Saving your score…' : 'Playing offline. Scores stay on this device.';
      $('boardWrap').hidden = true;
      feedbackStatus.textContent = '';
      feedbackForm.hidden = !online || feedbackSent;
      $('feedbackThanks').hidden = !feedbackSent;
      $('overSide').hidden = !online;
      if (!online) return;

      lastPlayId = await playIdPromise;
      const data = await api.finishRound(lastPlayId, result);
      if (!data) {
        standing.textContent = 'Could not save this round. Check your connection.';
        return;
      }
      standing.textContent = data.flagged
        ? "This round couldn't be verified, so it isn't on the leaderboard."
        : data.rank ? `You're #${data.rank} of ${data.ranked} riders · best ${formatScore(data.best)}` : '';
      renderBoard($('board'), data.leaderboard);
      $('boardWrap').hidden = data.leaderboard.length === 0;
    },
  };
}
