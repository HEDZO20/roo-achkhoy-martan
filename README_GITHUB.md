# ONLINE V19 — GitHub updater fixed

Эта версия исправляет остановку Windows PowerShell на сообщении:

`Configuring component 'Git Credential Manager'...`

Это было обычное информационное сообщение GCM в STDERR, а не реальная ошибка. Новый скрипт не вызывает `credential-manager configure`; Git for Windows использует установленный помощник автоматически при `git push`.

## Запуск

Дважды нажмите:

`1_UPDATE_GITHUB_FIXED.bat`

При первом push GitHub может открыть браузер для безопасного входа. Подтвердите аккаунт `HEDZO20`.

## Что делает скрипт

- использует существующий Git;
- не использует winget;
- не использует GitHub CLI;
- клонирует `HEDZO20/roo-achkhoy-martan`;
- создаёт резервную ветку;
- загружает V19 в `main`;
- пытается автоматически включить GitHub Pages;
- проверяет публикацию;
- открывает готовый сайт.
