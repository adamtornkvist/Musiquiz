/* eslint-disable react/no-unused-state */
/* global alert */
// first we will make a new context
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Cookies, withCookies } from 'react-cookie';
import uuidv4 from 'uuid';
import { on, emit } from './api';

export const GameContext = React.createContext();
export const GameConsumer = GameContext.Consumer;
const initialState = {
  name: null,
  players: [],
  isHost: false,
  nickname: null,
  started: false,
  guessTimer: null,
  isLeader: false,
  leader: null,
  correctSong: null,
  songToPlay: null,
  guessed: false,
  showSettings: false,
};
// Then create a provider Component
class GameProvider extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...initialState,
    };
  }

  componentDidMount() {
    const { cookies } = this.props;
    on('disconnect', () => {
      console.log('disc');
    });

    on('connect', () => {
      const session = cookies.get('session');
      if (session && session.nickname && session.name && session.sessionId) {
        emit('join', { ...session });
      }
    });

    on('playerDisconnected', player => {
      if (player) {
        this.setState({ players: this.updatePlayers(player) });
      }
    });

    on('roomNotFound', () => {
      this.setState({
        ...initialState,
      });
    });

    on('playerAlreadyExists', () => {
      this.setState({
        ...initialState,
      });
    });

    on('joinSuccess', ({ nickname, foundRoom }) => {
      const { leader } = foundRoom;
      this.setState({
        nickname,
        isLeader: leader ? leader.nickname === nickname : false,
        ...foundRoom,
      });
      if (foundRoom.gamestate === 'midgame') {
        this.startGuessTimer();
      }
    });

    on('playerJoined', player => {
      const { players, nickname } = this.state;
      const foundPlayer = players.find(p => p.nickname === player.nickname);
      if (foundPlayer) {
        this.setState({
          players: this.updatePlayers(player),
        });
      } else if (player.nickname !== nickname) {
        players.push(player);
        this.setState({ players });
      }
    });

    on('kick', data => {
      const { nickname } = this.state;
      if (nickname === data) {
        this.setState({
          name: null,
          players: [],
          isHost: false,
          nickname: null,
          started: false,
          guessTimer: null,
          isLeader: false,
          leader: null,
          correctSong: null,
          songToPlay: null,
          guessed: false,
        });
        cookies.remove('session');
      } else {
        const { players } = this.state;
        const newPlayers = players.filter(p => p.nickname !== data);
        this.setState({
          players: newPlayers,
        });
      }
    });

    on('updatePlayer', player => {
      const players = this.updatePlayers(player);
      this.setState({
        players,
      });
    });

    on('playerGuess', player => {
      console.log('playerGuess');
      const { nickname, guessed, correct } = this.state;
      const newPlayers = this.updatePlayers(player);
      const thisPlayer = player.nickname === nickname;
      this.setState({
        players: newPlayers,
        correct: thisPlayer ? player.correct : correct,
        guessed: thisPlayer ? true : guessed,
      });
    });

    on('updatePlayers', players => {
      this.setState({ players });
    });

    on('reset', () => {
      this.setState({
        name: null,
        players: [],
        isHost: false,
        nickname: null,
        started: false,
        guessTimer: null,
        isLeader: false,
        leader: null,
        correctSong: null,
        songToPlay: null,
        guessed: false,
      });
    });

    on('leader', leader => {
      const { nickname } = this.state;
      this.setState({
        leader,
        isLeader: leader.nickname === nickname,
      });
    });

    on('stopRound', ({ correctSong, gamestate }) => {
      this.setState({
        guessTimer: 0,
        correctSong,
        gamestate,
      });
    });

    on('startChoose', ({ gamestate }) => {
      this.setState({
        started: true,
        guessed: false,
        gamestate,
      });
    });

    on('startRound', ({ roundTime, gamestate }) => {
      this.setState({
        guessed: false,
        guessTimer: roundTime / 1000,
        gamestate,
      });
      this.startGuessTimer();
    });

    on('hostPlaySong', data => {
      this.setState({
        songToPlay: data,
      });
    });

    on('hostJoin', data => {
      this.setState({
        ...data,
      });
    });
  }

  onShowSettings() {
    const { showSettings } = this.state;
    this.setState({
      showSettings: !showSettings,
    });
  }

  updatePlayers(player) {
    const { players } = this.state;
    const newPlayers = players.filter(p => p.nickname !== player.nickname);
    newPlayers.push(player);
    return newPlayers;
  }

  startGuessTimer() {
    clearInterval(this.guessInterval);
    this.guessInterval = undefined;
    this.guessInterval = setInterval(() => {
      const { guessTimer } = this.state;
      if (guessTimer < 1) {
        clearInterval(this.guessInterval);
        this.guessInterval = undefined;
        this.setState({
          guessTimer: 0,
        });
        return;
      }
      this.setState({
        guessTimer: guessTimer - 1,
      });
    }, 1000);
  }

  joinAsPlayer(nickname, name) {
    const { cookies } = this.props;
    const session = cookies.get('session');
    if (!session || session.name !== name) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      cookies.set('session', { sessionId: uuidv4(), nickname, name }, { path: '/', expires: tomorrow });
    }
    if (!nickname.length) {
      return;
    }
    emit('join', { nickname, name, sessionId: cookies.get('session').sessionId });
  }

  joinAsHost() {
    this.setState(
      {
        isHost: true,
      },
      () => emit('hostJoin'),
    );
  }

  kickPlayer(player) {
    const { name } = this.state;
    emit('kick', { name, player });
  }

  guess(song) {
    const { guessed, nickname, name } = this.state;
    if (!guessed) {
      emit('guess', { song, name, nickname });
    }
  }

  sendSettings(settings) {
    const { name } = this.state;
    emit('settings', { name, settings });
  }

  selectSong(song) {
    const { name } = this.state;
    emit('selectedSong', { song, name });
  }

  render() {
    const { children } = this.props;
    return (
      <GameContext.Provider
        value={{
          state: this.state,
          onKickPlayer: player => this.kickPlayer(player),
          onJoinAsPlayer: (n, r) => this.joinAsPlayer(n, r),
          onJoinAsHost: () => this.joinAsHost(),
          onGuess: song => this.guess(song),
          onSelectSong: song => this.selectSong(song),
          onSaveSettings: time => this.sendSettings(time),
          onShowSettings: () => this.onShowSettings(),
        }}
      >
        {children}
      </GameContext.Provider>
    );
  }
}
GameProvider.propTypes = {
  children: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
  cookies: PropTypes.instanceOf(Cookies).isRequired,
};
GameProvider.defaultProps = {
  children: null,
};
export default withCookies(GameProvider);
