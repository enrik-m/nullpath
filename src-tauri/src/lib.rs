//! Nullpath — Tauri host
//!
//! Wires the SQL plugin (loading `migrations/001_initial_schema.sql`),
//! the opener plugin, and OS idle-detection commands.

mod idle;

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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nullpath.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            idle::get_idle_seconds,
            idle::idle_supported_on_platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
