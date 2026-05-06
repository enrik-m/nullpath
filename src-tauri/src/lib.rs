//! Nullpath — Tauri host
//!
//! Wires the SQL plugin (loading the migration sequence), the opener plugin,
//! the dialog plugin (used by the operator-card export), and the fs plugin
//! (used to write the exported PNG once the user picks a path).

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "seed web region",
            sql: include_str!("../migrations/002_seed_web.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "bounty submission ledger",
            sql: include_str!("../migrations/003_bounties.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "spaced repetition queue",
            sql: include_str!("../migrations/004_repetition.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "drop session tracking",
            sql: include_str!("../migrations/005_drop_session_tracking.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Updater is opt-in: present in the build but inert until
        // tauri.conf.json's `plugins.updater.endpoints` is configured
        // and a signing public key is set. Until then the frontend
        // call to check() returns "no update available" gracefully.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nullpath.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
