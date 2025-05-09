document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Элементы ---
    const roundInfoEl = document.getElementById('round-info');
    const dealerLivesEl = document.getElementById('dealer-lives');
    const playerLivesEl = document.getElementById('player-lives');
    const dealerChargesEl = document.getElementById('dealer-charges');
    const playerChargesEl = document.getElementById('player-charges');
    const dealerItemsEl = document.getElementById('dealer-items');
    const playerItemsEl = document.getElementById('player-items');
    const loadedCartridgesInfoEl = document.getElementById('loaded-cartridges-info');
    const chamberVisualizerEl = document.getElementById('chamber-visualizer');
    const shotgunStatusEl = document.getElementById('shotgun-status');
    const shootSelfBtn = document.getElementById('shoot-self-btn');
    const shootDealerBtn = document.getElementById('shoot-dealer-btn');
    const logAreaEl = document.getElementById('log-area');
    const gameOverScreenEl = document.getElementById('game-over-screen');
    const gameOverMessageEl = document.getElementById('game-over-message');
    const restartGameBtn = document.getElementById('restart-game-btn');
    const shotgunImgEl = document.getElementById('shotgun-img');
    const sawedOffIndicatorEl = document.getElementById('sawed-off-indicator');
    const itemStealChoiceContainerEl = document.getElementById('item-steal-choice-container');
    const stealableItemsListEl = document.getElementById('stealable-items-list');
    const cancelStealBtnEl = document.getElementById('cancel-steal-btn');
    const dealerHandcuffedIndicatorEl = document.getElementById('dealer-handcuffed-indicator');
    const playerHandcuffedIndicatorEl = document.getElementById('player-handcuffed-indicator');

    // --- Состояние игры ---
    let currentRound = 0;
    let playerLives = 0;
    let dealerLives = 0;
    let playerItems = [];
    let dealerItems = [];
    let shotgunChamber = [];
    let currentCartridgeIndex = 0;
    let isPlayerTurn = true;
    let sawedOffActive = false;
    let dealerHandcuffedTurns = 0;
    let playerHandcuffedTurns = 0;
    const MAX_ITEMS = 8;
    let roundsWonByPlayer = 0;
    let gameIsOver = false;
    let isLoadingShells = false; // Flag to prevent multiple reload calls

    let initialLiveShells = 0;
    let initialBlankShells = 0;
    let firstActionInLoadCycle = true;
    let shotgunShellsHistory = [];
    let knownShellByMagnifier = null; // { index: number, type: 'live'/'blank' }

    const SHOTGUN_ROTATION_DURATION = 300;
    const SHOTGUN_SHOOT_EFFECT_DURATION = 300;
    const DAMAGE_ANIMATION_DURATION = 800;
    const DEALER_TURN_MIN_DELAY = 1500;
    const PLAYER_CONTINUE_DELAY = 500;
    const animationDelayMedium = 1500;

    const ITEM_TYPES = {
        CIGARETTES: "Сигареты (+1 жизнь)",
        MAGNIFYING_GLASS: "Лупа (узнать патрон)",
        BEER: "Пиво (извлечь патрон)",
        HANDCUFFS: "Наручники",
        SAW: "Ножовка (x2 урон)",
        INVERTER: "Инвертор (меняет патрон)",
        PHONE: "Телефон (случайный патрон)",
        EXPIRED_MEDS: "Лекарство (50/50)",
        ADRENALINE: "Адреналин (украсть и использовать предмет)"
    };
    const availableItemsByRound = [
        [],
        [ITEM_TYPES.CIGARETTES, ITEM_TYPES.MAGNIFYING_GLASS, ITEM_TYPES.BEER, ITEM_TYPES.HANDCUFFS, ITEM_TYPES.SAW],
        Object.values(ITEM_TYPES)
    ];

    function getMaxLivesForCurrentRound() {
        const livesConfig = [0, 2, 3, 4]; // Index 0 unused, R1=2, R2=3, R3+=4
        return livesConfig[Math.min(currentRound, livesConfig.length - 1)] || 2;
    }

    function logMessage(message, type = 'info') {
        if (gameIsOver && (type !== 'important' && !message.toLowerCase().includes("игра окончена") && !message.toLowerCase().includes("победил"))) {
            return;
        }
        const p = document.createElement('p');
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        p.innerHTML = `[${timestamp}] ${message}`;
        if (type === 'player') p.style.color = '#87CEFA';
        else if (type === 'dealer') p.style.color = '#FF7F7F';
        else if (type === 'important') {
            p.style.color = '#FFFF99';
            alert(message);
        } else if (type === 'item') p.style.color = '#90EE90';
        logAreaEl.appendChild(p);
        logAreaEl.scrollTop = logAreaEl.scrollHeight;
    }

    function makeFirstActionDone() {
        if (firstActionInLoadCycle) {
            firstActionInLoadCycle = false;
        }
        knownShellByMagnifier = null;
    }

    function updateUI() {
        roundInfoEl.textContent = `Раунд: ${currentRound} (Побед: ${roundsWonByPlayer}/3)`;
        const maxLives = getMaxLivesForCurrentRound();
        playerLivesEl.textContent = `${playerLives} / ${maxLives}`;
        dealerLivesEl.textContent = `${dealerLives} / ${maxLives}`;

        playerChargesEl.innerHTML = '';
        for (let i = 0; i < playerLives; i++) { playerChargesEl.appendChild(Object.assign(document.createElement('div'), { className: 'charge' }));}
        dealerChargesEl.innerHTML = '';
        for (let i = 0; i < dealerLives; i++) { dealerChargesEl.appendChild(Object.assign(document.createElement('div'), { className: 'charge' }));}

        dealerHandcuffedIndicatorEl.classList.toggle('hidden', dealerHandcuffedTurns === 0);
        playerHandcuffedIndicatorEl.classList.toggle('hidden', playerHandcuffedTurns === 0);

        if (firstActionInLoadCycle && shotgunChamber.length > 0) {
            alert(`Заряжаем патроны в случайном порядке: ${initialLiveShells} боевых, ${initialBlankShells} холостых.`);
        }

        loadedCartridgesInfoEl.style.display = 'none';
        chamberVisualizerEl.innerHTML = '';

        for (let i = 0; i < shotgunChamber.length; i++) {
            const shellDiv = document.createElement('div');
            shellDiv.classList.add('cartridge');
            if (i < currentCartridgeIndex) {
                const historyShellType = shotgunShellsHistory[i];
                if (historyShellType === 'live') {
                    shellDiv.classList.add('live', 'used-known');
                    shellDiv.textContent = 'Б';
                } else if (historyShellType === 'blank') {
                    shellDiv.classList.add('blank', 'used-known');
                    shellDiv.textContent = 'Х';
                } else {
                    shellDiv.classList.add('used');
                    shellDiv.textContent = 'X';
                }
            } else {
                if (knownShellByMagnifier && knownShellByMagnifier.index === i) {
                    shellDiv.classList.add(knownShellByMagnifier.type === 'live' ? 'live' : 'blank', 'revealed-by-magnifier');
                    shellDiv.textContent = knownShellByMagnifier.type === 'live' ? 'Б' : 'Х';
                } else {
                    shellDiv.classList.add('unknown');
                    shellDiv.textContent = '?';
                }
                if (i === currentCartridgeIndex && !(knownShellByMagnifier && knownShellByMagnifier.index === i)) {
                    shellDiv.classList.add('current-shell-to-fire');
                }
            }
            chamberVisualizerEl.appendChild(shellDiv);
        }
    
        shotgunStatusEl.textContent = `Осталось патронов: ${Math.max(0, shotgunChamber.length - currentCartridgeIndex)}`;

        playerItemsEl.innerHTML = '';
        playerItems.forEach(item => {
            const itemBtn = document.createElement('button');
            itemBtn.classList.add('item-btn');
            itemBtn.textContent = item;
            itemBtn.disabled = !isPlayerTurn || gameIsOver || playerHandcuffedTurns > 0;
            itemBtn.onclick = () => useItem(item, 'player');
            playerItemsEl.appendChild(itemBtn);
        });

        dealerItemsEl.innerHTML = '';
        dealerItems.forEach(item => { dealerItemsEl.appendChild(Object.assign(document.createElement('div'), { className: 'item-tag', textContent: item }));});

        shootSelfBtn.disabled = !isPlayerTurn || gameIsOver || playerHandcuffedTurns > 0;
        shootDealerBtn.disabled = !isPlayerTurn || gameIsOver || playerHandcuffedTurns > 0;
        
        sawedOffIndicatorEl.classList.toggle('hidden', !sawedOffActive);

        document.getElementById('player-area').classList.remove('active-turn');
        document.getElementById('dealer-area').classList.remove('active-turn');
        if (!gameIsOver) {
            if (isPlayerTurn && playerHandcuffedTurns === 0) {
                document.getElementById('player-area').classList.add('active-turn');
            } else if (!isPlayerTurn && dealerHandcuffedTurns === 0) {
                 document.getElementById('dealer-area').classList.add('active-turn');
            }
        }
        
        if (isPlayerTurn && playerHandcuffedTurns > 0 && !gameIsOver) {
            logMessage(`Вы в наручниках и пропускаете ход (${playerHandcuffedTurns} ход(ов) осталось).`, 'player');
            playerHandcuffedTurns--;
            isPlayerTurn = false;
            
            shootSelfBtn.disabled = true;
            shootDealerBtn.disabled = true;
            playerItemsEl.querySelectorAll('button').forEach(btn => btn.disabled = true);
            document.getElementById('player-area').classList.remove('active-turn');

            setTimeout(() => {
                updateUI(); 
                if (!gameIsOver) setTimeout(dealerTurn, DEALER_TURN_MIN_DELAY / 2); 
            }, 500); 
            return; 
        }

        if (playerLives <= 0 && !gameIsOver) {
            endGame(false);
            return;
        } else if (dealerLives <= 0 && !gameIsOver) {
            logMessage(`Игрок победил в раунде ${currentRound}!`, 'important');
            roundsWonByPlayer++;
            roundInfoEl.textContent = `Раунд: ${currentRound} (Побед: ${roundsWonByPlayer}/3)`;

            if (roundsWonByPlayer >= 3) {
                endGame(true);
            } else {
                logMessage(`Готовимся к раунду ${currentRound + 1}...`, 'info');
                disablePlayerActions();
                setTimeout(() => {
                    if (!gameIsOver) {
                        currentRound++;
                        startRound();
                    }
                }, DEALER_TURN_MIN_DELAY + 1000); 
            }
            return;
        }

        if (!isLoadingShells && !gameIsOver && playerLives > 0 && dealerLives > 0 && currentCartridgeIndex >= shotgunChamber.length && shotgunChamber.length > 0) {
            isLoadingShells = true; 
            logMessage("Патроны в дробовике закончились! Заряжаем новые.", 'info');
            if (playerHandcuffedTurns > 0) {
                logMessage("Наручники на игроке сняты из-за перезарядки.", 'info');
                playerHandcuffedTurns = 0;
            }
            if (dealerHandcuffedTurns > 0) {
                logMessage("Наручники на дилере сняты из-за перезарядки.", 'info');
                dealerHandcuffedTurns = 0;
            }
            loadNewShells();
        }
    }
    
    function disablePlayerActions(disable = true) {
        shootSelfBtn.disabled = disable;
        shootDealerBtn.disabled = disable;
        playerItemsEl.querySelectorAll('button').forEach(btn => btn.disabled = disable);
    }


    function startGame() {
        gameIsOver = false;
        isLoadingShells = false;
        currentRound = 1;
        roundsWonByPlayer = 0;
        shotgunShellsHistory = [];
        knownShellByMagnifier = null;
        gameOverScreenEl.classList.add('hidden');
        itemStealChoiceContainerEl.classList.add('hidden');
        logAreaEl.innerHTML = '<p>Добро пожаловать в Buckshot Roulette!</p>';
        startRound();
    }

    function startRound() {
        logMessage(`--- Начинается Раунд ${currentRound} ---`, 'info');
        const currentRoundMaxLives = getMaxLivesForCurrentRound();
        playerLives = currentRoundMaxLives;
        dealerLives = currentRoundMaxLives;
        
        playerItems = [];
        dealerItems = [];
        shotgunShellsHistory = [];
        knownShellByMagnifier = null;
        sawedOffActive = false;
        dealerHandcuffedTurns = 0;
        playerHandcuffedTurns = 0;
        
        loadNewShells();
    }

    function loadNewShells() {
        shotgunShellsHistory = [];
        knownShellByMagnifier = null;
        logMessage("Дилер заряжает дробовик...", 'info');
        chamberVisualizerEl.innerHTML = '<p style="color:#aaa;">Зарядка...</p>';
        loadedCartridgesInfoEl.style.display = 'none';
        disablePlayerActions();

        setTimeout(() => {
            shotgunChamber = [];
            currentCartridgeIndex = 0;
            const totalShells = Math.floor(Math.random() * 5) + 2; // от 2 до 6

            let liveS;
            let blankS;

            if (totalShells >= 2) {
                liveS = Math.floor(Math.random() * (totalShells - 1)) + 1; // Ensures 1 to totalShells-1 live shells
                blankS = totalShells - liveS; // Ensures at least 1 blank shell
            } else { // Should not happen with current totalShells logic (min 2)
                liveS = Math.random() < 0.5 ? 1 : 0;
                blankS = 1 - liveS;
            }

            initialLiveShells = liveS;
            initialBlankShells = blankS;

            for (let i = 0; i < initialLiveShells; i++) shotgunChamber.push('live');
            for (let i = 0; i < initialBlankShells; i++) shotgunChamber.push('blank');
            shotgunChamber.sort(() => Math.random() - 0.5);

            firstActionInLoadCycle = true;
            logMessage(`Заряжено: ${initialLiveShells} боевых, ${initialBlankShells} холостых.`, 'info');
            
            if (currentRound >= 1) {
                const itemsToGiveCount = (currentRound === 1) ? 2 : (currentRound === 2 ? 3 : 4);
                giveItems(itemsToGiveCount);
            }
            isPlayerTurn = true;
            logMessage("Дробовик заряжен. Ход игрока.", 'player');
            isLoadingShells = false; // Reset flag after shells are loaded
            updateUI();
        }, animationDelayMedium);
    }

    function giveItems(count) { 
        const availableItemsPool = availableItemsByRound[Math.min(currentRound, availableItemsByRound.length -1)] || availableItemsByRound[availableItemsByRound.length-1];
        if (!availableItemsPool || !availableItemsPool.length) return;
        logMessage(`Выдаются предметы (${count} каждому)...`, 'item');
        for (let i = 0; i < count; i++) {
            if (playerItems.length < MAX_ITEMS) {
                playerItems.push(availableItemsPool[Math.floor(Math.random() * availableItemsPool.length)]);
            }
            if (dealerItems.length < MAX_ITEMS) {
                dealerItems.push(availableItemsPool[Math.floor(Math.random() * availableItemsPool.length)]);
            }
        }
    }

    function executeShot(targetIsPlayer, shooterIsPlayerContext) {
        if (gameIsOver || currentCartridgeIndex >= shotgunChamber.length) return;
        if (shooterIsPlayerContext && (!isPlayerTurn || playerHandcuffedTurns > 0)) return;

        makeFirstActionDone();
        disablePlayerActions();

        const rotationAngle = targetIsPlayer ? '90deg' : '-90deg';
        shotgunImgEl.style.setProperty('--current-shotgun-rotation', rotationAngle);
        if (targetIsPlayer) shotgunImgEl.classList.add('aim-player'); else shotgunImgEl.classList.add('aim-dealer');

        setTimeout(() => {
            shotgunImgEl.classList.add('shooting');
            
            const currentShell = shotgunChamber[currentCartridgeIndex];
            shotgunShellsHistory[currentCartridgeIndex] = currentShell;
            
            logMessage(`${shooterIsPlayerContext ? "Игрок" : "Дилер"} стреляет... Патрон: ${currentShell === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}`, 'info');
            
            let damage = 1;
            const wasSawedOff = sawedOffActive;
            if (sawedOffActive && currentShell === 'live') {
                damage = 2;
                logMessage("Ножовка удваивает урон!", 'info');
            }
            sawedOffActive = false;

            let hitZoneEl = null;

            if (currentShell === 'live') {
                if (targetIsPlayer) {
                    playerLives -= damage;
                    logMessage(`Выстрел в ${shooterIsPlayerContext ? "себя" : "игрока"}. Боевой! Потеряно ${damage} жизнь(и). ${wasSawedOff ? "(Обрез)" : ""}`, shooterIsPlayerContext ? 'player' : 'dealer');
                    hitZoneEl = document.getElementById('player-area');
                } else {
                    dealerLives -= damage;
                    logMessage(`Выстрел в дилера. Боевой! Дилер теряет ${damage} жизнь(и). ${wasSawedOff ? "(Обрез)" : ""}`, shooterIsPlayerContext ? 'player' : 'dealer');
                    hitZoneEl = document.getElementById('dealer-area');
                }
                isPlayerTurn = !isPlayerTurn;
            } else {
                if (targetIsPlayer) { 
                    logMessage(`Выстрел в ${shooterIsPlayerContext ? "себя" : "игрока"}. Холостой! ${wasSawedOff ? "(Обрез не сработал)" : ""} ${shooterIsPlayerContext ? "Дополнительный ход." : "Ход переходит к игроку."}`, shooterIsPlayerContext ? 'player' : 'dealer');
                    if (!shooterIsPlayerContext) isPlayerTurn = true;
                } else {
                    logMessage(`Выстрел в дилера. Холостой! ${wasSawedOff ? "(Обрез не сработал)" : ""} ${shooterIsPlayerContext ? "Ход переходит к дилеру." : "Дилер получает дополнительный ход."}`, shooterIsPlayerContext ? 'player' : 'dealer');
                    if (shooterIsPlayerContext) isPlayerTurn = false;
                }
            }
            currentCartridgeIndex++;

            if (hitZoneEl) {
                hitZoneEl.classList.add('damaged');
                setTimeout(() => hitZoneEl.classList.remove('damaged'), DAMAGE_ANIMATION_DURATION);
            }

            const effectCompletionDelay = Math.max(SHOTGUN_SHOOT_EFFECT_DURATION, DAMAGE_ANIMATION_DURATION / 2);

            setTimeout(() => {
                shotgunImgEl.classList.remove('shooting');

                shotgunImgEl.style.setProperty('--current-shotgun-rotation', '0deg');
                shotgunImgEl.classList.remove('aim-player', 'aim-dealer');

                setTimeout(() => {
                    updateUI(); 

                    if (!gameIsOver) {
                        if (!isPlayerTurn) {
                            setTimeout(dealerTurn, DEALER_TURN_MIN_DELAY);
                        } else if (playerLives > 0 && dealerLives > 0) {
                            logMessage("Ваш ход.", 'player');
                        }
                    }
                }, SHOTGUN_ROTATION_DURATION + (hitZoneEl ? DAMAGE_ANIMATION_DURATION / 2 : 0) );
            }, SHOTGUN_SHOOT_EFFECT_DURATION);
        }, SHOTGUN_ROTATION_DURATION);
    }

    function useItem(itemName, userType) {
        if (gameIsOver) return;
        if (userType === 'player' && (!isPlayerTurn || playerHandcuffedTurns > 0)) return;

        makeFirstActionDone();

        let userItemsArr = (userType === 'player') ? playerItems : dealerItems;
        const itemIndex = userItemsArr.indexOf(itemName);
        if (itemIndex === -1) return;

        logMessage(`${userType === 'player' ? 'Игрок' : 'Дилер'} использует "${itemName}".`, 'item');
        userItemsArr.splice(itemIndex, 1);

        switch (itemName) {
            case ITEM_TYPES.CIGARETTES:
                const maxLives = getMaxLivesForCurrentRound();
                if (userType === 'player') {
                    if (playerLives < maxLives) { playerLives++; logMessage("Восстановлена 1 жизнь.", 'player');}
                    else {logMessage("Жизни уже на максимуме.", 'player');}
                } else {
                    if (dealerLives < maxLives) { dealerLives++; logMessage("Дилер восстановил 1 жизнь.", 'dealer');}
                    else {logMessage("У дилера жизни на максимуме.", 'dealer');}
                }
                break;
            case ITEM_TYPES.MAGNIFYING_GLASS:
                if (currentCartridgeIndex < shotgunChamber.length) {
                    const currentShellType = shotgunChamber[currentCartridgeIndex];
                    knownShellByMagnifier = { index: currentCartridgeIndex, type: currentShellType };
                    logMessage(`Лупа: Текущий патрон - ${currentShellType === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}. (Информация видна до следующего действия)`, userType === 'player' ? 'player' : 'dealer');
                } else { 
                    logMessage("Лупа: Патронов нет.", userType === 'player' ? 'player' : 'dealer');
                }
                break;
            case ITEM_TYPES.BEER:
                if (currentCartridgeIndex < shotgunChamber.length) {
                    const ejectedShell = shotgunChamber[currentCartridgeIndex];
                    shotgunShellsHistory[currentCartridgeIndex] = ejectedShell;
                    logMessage(`Пиво: Извлечен патрон (${ejectedShell === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}). Ход сохранен.`, userType === 'player' ? 'player' : 'dealer');
                    currentCartridgeIndex++;
                } else { 
                    logMessage("Пиво: Патронов нет.", userType === 'player' ? 'player' : 'dealer'); 
                }
                break;
            case ITEM_TYPES.HANDCUFFS:
                if (userType === 'player') {
                    if (dealerHandcuffedTurns === 0) {
                        dealerHandcuffedTurns = 1;
                        logMessage("Дилер в наручниках и пропустит следующий ход!", 'player');
                    } else {
                        logMessage("Дилер уже в наручниках.", 'player');
                         playerItems.push(ITEM_TYPES.HANDCUFFS);
                    }
                } else { 
                    if (playerHandcuffedTurns === 0) {
                        playerHandcuffedTurns = 1;
                        logMessage("Вы в наручниках! Пропустите следующий ход.", 'dealer');
                    } else {
                        logMessage("Игрок уже в наручниках. Дилер не смог использовать Наручники.", 'dealer');
                        dealerItems.push(ITEM_TYPES.HANDCUFFS);
                    }
                }
                break;
            case ITEM_TYPES.SAW:
                sawedOffActive = true;
                logMessage("Ножовка: Дробовик превращен в обрез! Следующий выстрел x2 урон (если боевой).", userType === 'player' ? 'player' : 'dealer');
                break;
            case ITEM_TYPES.INVERTER:
                if (currentCartridgeIndex < shotgunChamber.length) {
                    const oldShell = shotgunChamber[currentCartridgeIndex];
                    shotgunChamber[currentCartridgeIndex] = (oldShell === 'live') ? 'blank' : 'live';
                    logMessage(`Инвертор: Тип текущего патрона изменен с ${oldShell === 'live' ? 'БОЕВОГО' : 'ХОЛОСТОГО'} на ${shotgunChamber[currentCartridgeIndex] === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}.`, userType === 'player' ? 'player' : 'dealer');
                    if (knownShellByMagnifier && knownShellByMagnifier.index === currentCartridgeIndex) {
                        knownShellByMagnifier.type = shotgunChamber[currentCartridgeIndex];
                    }
                } else { logMessage("Инвертор: Патронов нет.", userType === 'player' ? 'player' : 'dealer'); }
                break;
            case ITEM_TYPES.PHONE:
                 if (shotgunChamber.length > currentCartridgeIndex + 1) {
                    const inspectableIndices = [];
                    for (let i = currentCartridgeIndex + 1; i < shotgunChamber.length; i++) inspectableIndices.push(i);
                    
                    if (inspectableIndices.length > 0) {
                        const randomFutureIndex = inspectableIndices[Math.floor(Math.random() * inspectableIndices.length)];
                        const revealedShell = shotgunChamber[randomFutureIndex];
                        const position = randomFutureIndex - currentCartridgeIndex;
                        const message = `Телефон: ${position}-й патрон от текущего (${position === 1 ? "следующий" : `через ${position-1}`}) - ${revealedShell === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}.`;
                        if (userType === 'player') alert(message); 
                        logMessage(message, userType === 'player' ? 'player' : 'dealer');
                    } else { logMessage("Телефон: Нет следующих патронов для просмотра (только текущий).", userType === 'player' ? 'player' : 'dealer');}
                } else { logMessage("Телефон: Нет следующих патронов для просмотра.", userType === 'player' ? 'player' : 'dealer');}
                break;
            case ITEM_TYPES.EXPIRED_MEDS:
                const isMedSuccess = Math.random() < 0.5;
                const medMaxLives = getMaxLivesForCurrentRound();

                if (userType === 'player') {
                    if (isMedSuccess) {
                        const livesToGain = Math.min(2, medMaxLives - playerLives);
                        if (livesToGain > 0) {
                            playerLives += livesToGain;
                            logMessage(`Лекарство: Успех! +${livesToGain} жизни.`, 'player');
                            alert(`Успех! +${livesToGain} жизни.`);
                        } else {
                            logMessage("Лекарство: Успех, но жизни уже на максимуме.", 'player');
                        }
                    } else {
                        playerLives = Math.max(0, playerLives - 1);
                        logMessage("Лекарство: Провал! -1 жизнь.", 'player');
                        alert(`Провал! -1 жизнь.`);
                    }
                } else { 
                    if (isMedSuccess) {
                        const livesToGain = Math.min(2, medMaxLives - dealerLives);
                        if (livesToGain > 0) {
                            dealerLives += livesToGain;
                            logMessage(`Лекарство (Дилер): Успех! +${livesToGain} жизни.`, 'dealer');
                            alert(`Дилер использует Лекарство: Успех! +${livesToGain} жизни.`);
                        } else {
                            logMessage("Лекарство (Дилер): Успех, но жизни уже на максимуме.", 'dealer');
                            alert("Дилер использует Лекарство: Успех, но жизни уже на максимуме.");
                        }
                    } else {
                        dealerLives = Math.max(0, dealerLives - 1);
                        logMessage("Лекарство (Дилер): Провал! -1 жизнь.", 'dealer');
                        alert("Дилер использует Лекарство: Провал! -1 жизнь.");
                    }
                }
                break;
            case ITEM_TYPES.ADRENALINE:
                if (userType === 'player') {
                    let stealableItemsFromDealer = dealerItems.filter(item => item !== ITEM_TYPES.ADRENALINE);
                    if (stealableItemsFromDealer.length > 0) {
                        itemStealChoiceContainerEl.classList.remove('hidden');
                        stealableItemsListEl.innerHTML = ''; 
                        stealableItemsFromDealer.forEach(itemToSteal => {
                            const btn = document.createElement('button');
                            btn.textContent = itemToSteal;
                            btn.onclick = () => {
                                itemStealChoiceContainerEl.classList.add('hidden');
                                const stolenItemIndex = dealerItems.indexOf(itemToSteal);
                                if (stolenItemIndex > -1) {
                                    const actuallyStolenItem = dealerItems.splice(stolenItemIndex, 1)[0];
                                    logMessage(`Адреналин: Вы украли "${actuallyStolenItem}" у дилера. Используете немедленно.`, 'player');
                                    playerItems.push(actuallyStolenItem);
                                    useItem(actuallyStolenItem, 'player'); 
                                } else { updateUI(); } 
                            };
                            stealableItemsListEl.appendChild(btn);
                        });
                        return;
                    } else {
                        logMessage("Адреналин: У дилера нет подходящих предметов для кражи.", 'player');
                    }
                } else {
                    let stealableFromPlayer = playerItems.filter(item => item !== ITEM_TYPES.ADRENALINE);
                    if (stealableFromPlayer.length > 0) {
                        const stolenItemName = stealableFromPlayer[Math.floor(Math.random() * stealableFromPlayer.length)];
                        const stolenIdx = playerItems.indexOf(stolenItemName);
                        if (stolenIdx > -1) {
                           const actuallyStolenItem = playerItems.splice(stolenIdx, 1)[0];
                           const stealMsg = `Адреналин: Дилер украл у вас "${actuallyStolenItem}" и немедленно использует.`;
                           logMessage(stealMsg, 'dealer');
                           alert(stealMsg);
                           dealerItems.push(actuallyStolenItem);
                           useItem(actuallyStolenItem, 'dealer');
                           return;
                        }
                    } else {
                        logMessage("Адреналин (Дилер): У вас нет подходящих предметов для кражи.", 'dealer');
                    }
                }
                break;
        }
        
        updateUI();
    }

    cancelStealBtnEl.onclick = () => {
        itemStealChoiceContainerEl.classList.add('hidden');
        logMessage("Выбор цели для Адреналина отменен. Адреналин потрачен.", "player");
        updateUI(); 
    };

    function dealerTurn() {
        if (gameIsOver || isPlayerTurn || playerLives <= 0 || dealerLives <= 0) return;

        logMessage("Ход дилера...", 'dealer');
        disablePlayerActions();

        if (dealerHandcuffedTurns > 0) {
            logMessage("Дилер в наручниках и пропускает ход.", 'important');
            dealerHandcuffedTurns--;
            isPlayerTurn = true;
            updateUI(); 
            if (!gameIsOver) logMessage("Ваш ход.", 'player');
            return;
        }
        
        let itemUsedThisAiCycle = false;
        let knownCurrentShellTypeByAI = (knownShellByMagnifier && knownShellByMagnifier.index === currentCartridgeIndex) ? knownShellByMagnifier.type : null;

        function dealerItemLogic() {
            if (itemUsedThisAiCycle || gameIsOver || currentCartridgeIndex >= shotgunChamber.length) return false;

            if (!knownCurrentShellTypeByAI && dealerItems.includes(ITEM_TYPES.MAGNIFYING_GLASS)) {
                logMessage("Дилер использует Лупу.", 'important');
                useItem(ITEM_TYPES.MAGNIFYING_GLASS, 'dealer'); 
                knownCurrentShellTypeByAI = shotgunChamber[currentCartridgeIndex]; 
                itemUsedThisAiCycle = true; 
                return true;
            }
            
            const maxDealerLives = getMaxLivesForCurrentRound();
            if (dealerLives < maxDealerLives && dealerItems.includes(ITEM_TYPES.CIGARETTES) && dealerLives <=1) {
                logMessage("Дилер использует Сигареты.", 'important');
                useItem(ITEM_TYPES.CIGARETTES, 'dealer');
                itemUsedThisAiCycle = true; return true;
            }
            if (dealerItems.includes(ITEM_TYPES.EXPIRED_MEDS) && dealerLives <= maxDealerLives / 2 && Math.random() < 0.6) {
                logMessage("Дилер использует Лекарство.", 'info');
                useItem(ITEM_TYPES.EXPIRED_MEDS, 'dealer');
                itemUsedThisAiCycle = true; return true;
            }

            if (knownCurrentShellTypeByAI === 'live' && dealerItems.includes(ITEM_TYPES.BEER)) {
                if (playerLives > 1 || dealerLives === 1) { 
                    logMessage("Дилер использует Пиво, чтобы извлечь боевой патрон.", 'important');
                    useItem(ITEM_TYPES.BEER, 'dealer');
                    knownCurrentShellTypeByAI = null; 
                    itemUsedThisAiCycle = true; return true;
                }
            }
            if (dealerItems.includes(ITEM_TYPES.SAW) && !sawedOffActive && 
                (knownCurrentShellTypeByAI === 'live' || (playerLives === 1 && initialLiveShells > initialBlankShells))) {
                logMessage("Дилер использует Ножовку.", 'important');
                useItem(ITEM_TYPES.SAW, 'dealer');
                itemUsedThisAiCycle = true; return true;
            }
            if (dealerItems.includes(ITEM_TYPES.HANDCUFFS) && playerHandcuffedTurns === 0 && 
                (playerItems.length >=2 || (playerLives ===1 && dealerLives > 1 && Math.random() < 0.7))) {
                logMessage("Дилер использует Наручники.", 'important');
                useItem(ITEM_TYPES.HANDCUFFS, 'dealer'); 
                itemUsedThisAiCycle = true; return true; 
            }
            if (dealerItems.length < 2 && playerItems.length > dealerItems.length && dealerItems.includes(ITEM_TYPES.ADRENALINE) && Math.random() < 0.5) {
                logMessage("Дилер использует Адреналин.", 'important');
                useItem(ITEM_TYPES.ADRENALINE, 'dealer');
                itemUsedThisAiCycle = true;
                return true;
            }


            return false;
        }

        if (dealerItemLogic()) {
            if (!isPlayerTurn && !gameIsOver) { 
                setTimeout(dealerTurn, DEALER_TURN_MIN_DELAY); 
            } else if (isPlayerTurn && !gameIsOver) {
                logMessage("Ваш ход.", 'player');
                updateUI();
            }
            return; 
        }

        if (currentCartridgeIndex >= shotgunChamber.length) {
            if (!gameIsOver) { 
                updateUI();
            }
            return;
        }
        
        let shootTargetIsPlayer;
        const remainingShells = shotgunChamber.slice(currentCartridgeIndex);
        const remainingBlanks = remainingShells.filter(s => s === 'blank').length;
        const remainingLivesInGun = remainingShells.filter(s => s === 'live').length;

        if (knownCurrentShellTypeByAI === 'live') {
            shootTargetIsPlayer = true;
            logMessage("Дилер знает, что патрон боевой. Стреляет в игрока.", 'dealer');
        } else if (knownCurrentShellTypeByAI === 'blank') {
            shootTargetIsPlayer = false;
            logMessage("Дилер знает, что патрон холостой. Стреляет в себя (доп. ход).", 'dealer');
        } else {
            // Simple AI based on probabilities and game state
            if (dealerLives === 1 && playerLives > 1 && remainingBlanks > 0 && remainingLivesInGun > 0) {
                shootTargetIsPlayer = (remainingBlanks / remainingShells.length) > 0.6;
            } else if (playerLives === 1 && remainingLivesInGun > 0) {
                shootTargetIsPlayer = true;
            } else if (remainingLivesInGun === 0 && remainingBlanks > 0) {
                shootTargetIsPlayer = false;
            } else if (remainingBlanks === 0 && remainingLivesInGun > 0) {
                shootTargetIsPlayer = true;
            }
            else if (remainingBlanks >= remainingLivesInGun && remainingBlanks > 0) {
                shootTargetIsPlayer = false; 
            } else {
                shootTargetIsPlayer = true;
            }
            logMessage(`Дилер ${shootTargetIsPlayer ? "стреляет в игрока" : "рискует выстрелить в себя"}. (Неизвестный патрон)`, 'dealer');
        }
        executeShot(shootTargetIsPlayer, false);
    }

    function endGame(playerWonGame) {
        if (gameIsOver) return; 
        gameIsOver = true;

        gameOverScreenEl.classList.remove('hidden');
        shotgunImgEl.style.setProperty('--current-shotgun-rotation', '0deg');
        shotgunImgEl.classList.remove('aim-player', 'aim-dealer', 'shooting');

        if (playerWonGame) {
            gameOverMessageEl.textContent = "Поздравляем! Вы победили Дилера в 3 раундах!";
            logMessage("ИГРА ОКОНЧЕНА: ВЫ ПОБЕДИЛИ!", 'important');
        } else {
            gameOverMessageEl.textContent = "Игра окончена. Дилер победил.";
            logMessage("ИГРА ОКОНЧЕНА: ДИЛЕР ПОБЕДИЛ.", 'important');
        }
        disablePlayerActions();
        document.getElementById('player-area').classList.remove('active-turn'); 
        document.getElementById('dealer-area').classList.remove('active-turn');
    }

    shootSelfBtn.addEventListener('click', () => {
        if (!isPlayerTurn || gameIsOver || playerHandcuffedTurns > 0) return;
        logMessage("Игрок решает выстрелить в себя.", 'player');
        executeShot(true, true);
    });

    shootDealerBtn.addEventListener('click', () => {
        if (!isPlayerTurn || gameIsOver || playerHandcuffedTurns > 0) return;
        logMessage("Игрок решает выстрелить в дилера.", 'player');
        executeShot(false, true);
    });

    restartGameBtn.addEventListener('click', startGame);
    startGame();
});
