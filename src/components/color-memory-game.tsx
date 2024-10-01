"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
import { Crown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { GameState, LocalUserData } from "../types"
import { calculateColorDifference, calculateDifficulty } from "../lib/color-utils"

// Remove the debounce import
// import { debounce } from 'lodash';

const ColorSwatch = dynamic(() => import('./color-swatch'))
const ScoreDisplay = dynamic(() => import('./score-display'))
const Leaderboard = dynamic(() => import('./Leaderboard').then(mod => mod.Leaderboard))

// Add this near the top of your file
const AttractiveButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...props }) => (
  <Button
    className={`bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 ${className}`}
    {...props}
  />
);

// Create a separate worker for score saving
const scoreSavingWorker = new Worker(new URL('../workers/scoreSavingWorker.ts', import.meta.url));

export function ColorMemoryGame() {
  const [localUserData, setLocalUserData] = useState<LocalUserData | null>(null);
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [tempUsername, setTempUsername] = useState('');
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const memoizedToast = useCallback(toast, []);
  
  useEffect(() => {
    const storedData = localStorage.getItem('userData')
    if (storedData) {
      setLocalUserData(JSON.parse(storedData))
    }
  }, [])

  const [gameState, setGameState] = useState<GameState>({
    targetColor: '',
    options: [],
    score: 0,
    level: 1,
    timeLeft: 2,
    isPlaying: false,
    highScore: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showTarget, setShowTarget] = useState(false)
  const [showLossDialog, setShowLossDialog] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [feedbackText, setFeedbackText] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [exactMatch, setExactMatch] = useState(false);
  const [performanceRating, setPerformanceRating] = useState(1);
  const [closeMatches, setCloseMatches] = useState(0);
  const [levelStarted, setLevelStarted] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [isProcessingSelection, setIsProcessingSelection] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/colorWorker.ts', import.meta.url));
    return () => workerRef.current?.terminate();
  }, []);

  const generateColorsWithWorker = useCallback((level: number, performanceRating: number) => {
    return new Promise((resolve) => {
      if (workerRef.current) {
        workerRef.current.onmessage = (e: MessageEvent) => {
          resolve(e.data);
        };
        workerRef.current.postMessage({ level, performanceRating });
      }
    });
  }, []);

  const saveUserData = useCallback((username: string, score: number) => {
    const userData: LocalUserData = { username, highestScore: score }
    localStorage.setItem('userData', JSON.stringify(userData))
    setLocalUserData(userData)
  }, [])

  const updateUserData = useCallback((newScore: number) => {
    if (localUserData) {
      const updatedUserData = { 
        ...localUserData, 
        highestScore: Math.max(localUserData.highestScore, newScore) 
      }
      localStorage.setItem('userData', JSON.stringify(updatedUserData))
      setLocalUserData(updatedUserData)
    }
  }, [localUserData])

  // Move the saveScoreInBackground function declaration before handleUsernameSubmit
  const saveScoreInBackground = useCallback((username: string, score: number, level: number) => {
    scoreSavingWorker.postMessage({ username, score, level });
    scoreSavingWorker.onmessage = (event) => {
      if (event.data.error) {
        console.error('Failed to save score:', event.data.error);
        memoizedToast({
          title: "Error",
          description: "Failed to save your score. Please try again.",
        });
      } else {
        setGameState(prev => ({
          ...prev,
          highScore: event.data.highestScore,
        }));
        updateUserData(event.data.highestScore);
        // Remove the force refresh of the leaderboard
      }
    };
  }, [memoizedToast, updateUserData]);

  const startGame = useCallback(async () => {
    console.log('Starting game...');
    setIsLoading(true);
    try {
      console.log('Generating initial colors...');
      const colors = await generateColorsWithWorker(1, 1) as { target: string, options: string[] };
      console.log('Initial colors generated:', colors);
      
      console.log('Updating game state...');
      setGameState(prev => {
        const newState = {
          ...prev,
          isPlaying: true,
          score: 0,
          level: 1,
          timeLeft: 3, // viewTime
          targetColor: colors.target,
          options: colors.options
        };
        console.log('New game state:', newState);
        return newState;
      });
      
      console.log('Setting up game parameters...');
      setShowTarget(true);
      setComboMultiplier(1);
      setCloseMatches(0);
      setLevelStarted(0);
      setPerformanceRating(1);
      setShowLossDialog(false);
      
      console.log('Game state initialized');
    } catch (error) {
      console.error('Error starting game:', error);
      memoizedToast({
        title: "Error",
        description: "Failed to start the game. Please try again.",
      });
    } finally {
      console.log('Setting isLoading to false');
      setIsLoading(false);
      console.log('Start game process completed');
    }
  }, [generateColorsWithWorker, memoizedToast]);

  const handleUsernameSubmit = useCallback(async () => {
    if (tempUsername.trim()) {
      // Check if username exists in the leaderboard
      const response = await fetch(`/api/check-username?username=${encodeURIComponent(tempUsername)}`)
      const { exists, highestScore } = await response.json()

      if (exists) {
        saveUserData(tempUsername, Math.max(highestScore, gameState.score))
      } else {
        saveUserData(tempUsername, gameState.score)
      }

      setShowUsernameInput(false)
      setTempUsername('')
      
      // Save score immediately after setting username
      saveScoreInBackground(tempUsername, gameState.score, gameState.level);

      // Start a new game instead of opening the leaderboard
      startGame();
    }
  }, [tempUsername, gameState.score, gameState.level, saveUserData, saveScoreInBackground, startGame]);

  const endGame = useCallback((lost = false) => {
    setGameState(prev => {
      const newHighScore = prev.score > (localUserData?.highestScore || 0);
      setIsNewHighScore(newHighScore);
      
      if (newHighScore) {
        memoizedToast({
          title: "New High Score!",
          description: `Congratulations! You've set a new high score of ${prev.score} points!`,
        });
      }
      
      return { ...prev, isPlaying: false };
    });

    if (!localUserData) {
      setShowUsernameInput(true)
    } else {
      // Save score in the background
      saveScoreInBackground(localUserData.username, gameState.score, gameState.level);
    }

    if (lost) {
      setShowLossDialog(true);
    }

    // Remove the automatic opening of the leaderboard
    // setTimeout(() => setShowLeaderboard(true), 500);
  }, [gameState.score, gameState.level, localUserData, memoizedToast, saveScoreInBackground]);

  // Update the openLeaderboard function
  const openLeaderboard = useCallback(() => {
    if (!showLeaderboard) {
      setIsLeaderboardLoading(true);
      setShowLeaderboard(true);
      if (localUserData) {
        saveScoreInBackground(localUserData.username, gameState.score, gameState.level);
      }
    }
  }, [showLeaderboard, localUserData, gameState.score, gameState.level, saveScoreInBackground]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('Timer effect triggered:', { isPlaying: gameState.isPlaying, timeLeft: gameState.timeLeft, showTarget });
    const clearTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    if (gameState.isPlaying && gameState.timeLeft > 0) {
      console.log('Starting timer');
      clearTimer(); // Clear any existing timer
      timerRef.current = setInterval(() => {
        setGameState(prev => ({
          ...prev,
          timeLeft: Math.max(0, prev.timeLeft - 1)
        }));
      }, 1000);
    } else if (gameState.isPlaying && gameState.timeLeft === 0) {
      console.log('Timer reached zero');
      clearTimer();
      if (showTarget) {
        console.log('Hiding target, showing color options');
        setShowTarget(false);
        const { selectionTime } = calculateDifficulty(gameState.level, performanceRating);
        setGameState(prev => ({ ...prev, timeLeft: selectionTime }));
      } else {
        console.log('Time up, ending game');
        endGame(true);
      }
    }

    return clearTimer;
  }, [gameState.isPlaying, gameState.timeLeft, showTarget, gameState.level, endGame, performanceRating]);

  const handleColorSelect = useCallback(async (selectedColor: string) => {
    console.log('Color selected:', selectedColor, 'Current level:', gameState.level);
    if (!gameState.isPlaying || isProcessingSelection) {
      console.log('Selection ignored: game not playing or already processing');
      return;
    }

    setIsProcessingSelection(true);

    try {
      const difference = calculateColorDifference(gameState.targetColor, selectedColor);
      console.log('Color difference:', difference);

      const { selectionTime } = calculateDifficulty(gameState.level, performanceRating);
      const timeBonus = Math.max(0, gameState.timeLeft / selectionTime);
      
      const similarityThreshold = 0.1 - (Math.min(gameState.level, 50) * 0.001);
      const isExactMatch = difference < 0.01;
      
      const closeMatchLimit = gameState.level <= 50 ? 3 : 1;
      const currentTenLevelBlock = Math.floor(gameState.level / 10);
      
      let newCloseMatches = closeMatches;
      let newPerformanceRating = performanceRating;
      let newComboMultiplier = comboMultiplier;
      let gameOver = false;
      let feedbackMessage = "";

      if (levelStarted !== currentTenLevelBlock) {
        newCloseMatches = 0;
      }

      if (!isExactMatch) {
        newCloseMatches++;
        newPerformanceRating = Math.max(0.9, performanceRating - 0.02);
        newComboMultiplier = 1;
      } else {
        newPerformanceRating = Math.min(1.1, performanceRating + 0.01);
        newComboMultiplier = Math.min(5, comboMultiplier + 0.5);
      }

      if (!isExactMatch && newCloseMatches > closeMatchLimit) {
        feedbackMessage = "Game Over! Too many close matches.";
        gameOver = true;
      } else if (difference >= similarityThreshold) {
        feedbackMessage = "Game Over! Color mismatch.";
        gameOver = true;
      } else {
        feedbackMessage = isExactMatch ? `Perfect! ${newComboMultiplier.toFixed(1)}x Combo!` : "Close enough!";
      }

      const accuracyPoints = Math.max(0, 100 - Math.round(difference * 1000));
      const speedPoints = Math.round(timeBonus * 50);
      const totalPoints = Math.round((accuracyPoints + speedPoints) * newComboMultiplier);

      console.log('Updating game state. Game over:', gameOver);

      if (gameOver) {
        console.log('Game over, calling endGame');
        endGame(true);
      } else {
        console.log('Generating new colors for next level');
        const newColors = await generateColorsWithWorker(gameState.level + 1, newPerformanceRating) as { target: string, options: string[] };
        console.log('New colors generated:', newColors);
        setGameState(prevState => ({
          ...prevState,
          level: prevState.level + 1,
          score: prevState.score + totalPoints,
          targetColor: newColors.target,
          options: newColors.options,
          timeLeft: 3, // viewTime
        }));
        setShowTarget(true);
        setIsProcessingSelection(false); // Reset processing flag after successful selection
      }

      setExactMatch(isExactMatch);
      setLevelStarted(currentTenLevelBlock);
      setCloseMatches(newCloseMatches);
      setPerformanceRating(newPerformanceRating);
      setComboMultiplier(newComboMultiplier);
      setFeedbackText(feedbackMessage);
      setShowFeedback(true);
      
      setTimeout(() => setShowFeedback(false), 1000);

      memoizedToast({
        title: "Color Selected!",
        description: `You earned ${totalPoints} points! (Accuracy: ${accuracyPoints}, Speed: ${speedPoints}${newComboMultiplier > 1 ? `, Combo: ${newComboMultiplier.toFixed(1)}x` : ''})`,
      });
    } catch (error) {
      console.error("Error in handleColorSelect:", error);
      endGame(true);
    } finally {
      setIsProcessingSelection(false);
      console.log('Color selection processing completed');
    }
  }, [gameState, isProcessingSelection, performanceRating, levelStarted, closeMatches, comboMultiplier, endGame, generateColorsWithWorker, memoizedToast]);

  const debouncedHandleColorSelect = useCallback(
    (selectedColor: string) => {
      if (!isProcessingSelection) {
        handleColorSelect(selectedColor);
      }
    },
    [handleColorSelect, isProcessingSelection]
  );

  const renderColorSwatches = useCallback(() => {
    const totalColors = Math.min(6, gameState.options.length);
    console.log('Rendering color swatches:', gameState.options.slice(0, totalColors));
    return (
      <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 lg:gap-8 justify-center max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl mx-auto">
        {gameState.options.slice(0, totalColors).map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            size="medium"
            onClick={() => {
              console.log('ColorSwatch in ColorMemoryGame clicked:', color);
              debouncedHandleColorSelect(color);
            }}
          />
        ))}
      </div>
    );
  }, [gameState.options, debouncedHandleColorSelect]);

  useEffect(() => {
    console.log('Game state updated:', gameState);
  }, [gameState]);

  useEffect(() => {
    console.log('Show target:', showTarget);
  }, [showTarget]);

  useEffect(() => {
    console.log('isLoading changed:', isLoading);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div>Loading...</div>
        <div>Game State: {JSON.stringify(gameState)}</div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 pb-4 sm:pb-6 relative">
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 flex justify-between items-center">
        <Button 
          onClick={openLeaderboard} 
          size="sm" 
          className="h-8 text-xs sm:text-sm sm:h-10 bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg"
        >
          <Crown className="mr-1 h-4 w-4" /> Champions
        </Button>
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`text-lg sm:text-xl md:text-2xl font-bold text-right ${exactMatch ? 'text-green-500' : 'text-yellow-500'}`}
            >
              {feedbackText}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Add margin-top to this div */}
      <div className="mt-16 sm:mt-20">
        {!gameState.isPlaying && (
          <div className="text-center mt-16 sm:mt-20 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-gray-800">
              Ready to test your color perception skills?
            </h2>
            <div className="bg-white bg-opacity-80 p-4 sm:p-6 rounded-lg shadow-md mb-6">
              <p className="text-sm sm:text-base md:text-lg text-gray-700 leading-relaxed text-center mb-2">
                Here&apos;s how to play:
              </p>
              <ul className="text-sm sm:text-base md:text-lg text-gray-700 list-disc list-inside mt-2 space-y-2 text-left">
                <li>A color will appear briefly</li>
                <li>Memorize it, then choose the matching color from the options</li>
                <li>You can pick close matches, but you&apos;re limited to 3 in early levels</li>
                <li>Be quick and accurate to score high!</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Button 
                onClick={startGame} 
                size="lg" 
                className="text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4 md:text-xl md:px-12 md:py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              >
                Start Game
              </Button>
            </div>
          </div>
        )}
        
        {gameState.isPlaying && (
          <div className="space-y-2 sm:space-y-4">
            <ScoreDisplay gameState={gameState} comboMultiplier={comboMultiplier} closeMatches={closeMatches} closeMatchLimit={gameState.level <= 50 ? 3 : 1} />
            <div className="flex justify-center my-8 sm:my-0">
              {showTarget ? (
                <ColorSwatch 
                  key={`target-${gameState.targetColor}`}
                  color={gameState.targetColor} 
                  size="large"
                  // We don't need to pass an onClick prop for the target color
                />
              ) : (
                renderColorSwatches()
              )}
            </div>
            <Progress 
              value={(gameState.timeLeft / (showTarget ? calculateDifficulty(gameState.level, performanceRating).viewTime : calculateDifficulty(gameState.level, performanceRating).selectionTime)) * 100} 
              className="h-2 sm:h-3 md:h-4 w-full"
            />
          </div>
        )}
      </div>

      <Dialog open={showLossDialog} onOpenChange={setShowLossDialog}>
        <DialogContent className="sm:max-w-[425px] z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-yellow-600">Game Over!</DialogTitle>
            <DialogDescription>
              {isNewHighScore 
                ? "Congratulations! You've set a new personal best!" 
                : "Great effort! Here's how you did:"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-2xl font-bold text-center">
              Your Score: {gameState.score}
            </p>
            <p className="text-xl text-center">Level Reached: {gameState.level}</p>
            {isNewHighScore && (
              <p className="text-lg text-center text-green-600">
                New High Score: {gameState.score}
              </p>
            )}
            {showUsernameInput && (
              <div>
                <p className="text-sm text-gray-600 mb-2">Enter a username to save your score:</p>
                <Input
                  value={tempUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempUsername(e.target.value)}
                  placeholder="Username"
                  required
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {showUsernameInput ? (
              <AttractiveButton onClick={handleUsernameSubmit} disabled={!tempUsername.trim()}>
                Save Score and Play Again
              </AttractiveButton>
            ) : (
              <AttractiveButton onClick={startGame}>
                Play Again
              </AttractiveButton>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaderboard} onOpenChange={setShowLeaderboard}>
        <DialogContent className="sm:max-w-[425px] max-h-[80vh] overflow-y-auto overflow-x-hidden z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-yellow-600">Champions</DialogTitle>
            <DialogDescription className="text-gray-600">
              Behold the top color masters:
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Leaderboard 
              localUserData={localUserData} 
              isLoading={isLeaderboardLoading}
              setIsLoading={setIsLeaderboardLoading}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}