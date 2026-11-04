//! Зашифроване локальне сховище Olymp Helper.
//!
//! Дані лежать у `%APPDATA%\<id застосунку>\` у трьох файлах (`settings.oly`, `cache.oly`, `notes.oly`).
//! Кожен файл: "OLY1" + nonce (12 байт) + AES-256-GCM(JSON). Ім'я файлу входить в автентифікацію,
//! тому файли не можна підмінити один одним, а будь-яка зміна вручну ламає тег GCM.
//! Ключ = SHA-256(секрет збірки + ідентифікатор машини): файли з іншого ПК не розшифруються.
//! Перед кожним записом попередня справна копія зберігається як `.bak`.
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng, Payload},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io, path::PathBuf, sync::Mutex};

const MAGIC: &[u8; 4] = b"OLY1";
const SLOTS: [&str; 3] = ["settings", "cache", "notes"];

pub fn slot(key: &str) -> &'static str {
    match key {
        "notes.cache" => "notes",
        "laws.cache" | "faq.cache" | "manifest.cache" | "news.cache" => "cache",
        _ => "settings",
    }
}

fn derive(secret: &str, machine: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(secret.as_bytes());
    h.update(machine.as_bytes());
    h.update(b"olymp-helper/vault/v1");
    let mut out = [0u8; 32];
    out.copy_from_slice(&h.finalize());
    out
}

pub struct Vault {
    dir: PathBuf,
    key: [u8; 32],
    data: Mutex<HashMap<String, String>>,
    /// Файли, які були пошкоджені або змінені вручну й відновлені (з резервної копії або «з нуля»).
    pub restored: Vec<String>,
}

impl Vault {
    pub fn open(dir: PathBuf, secret: &str, machine: &str) -> Vault {
        let _ = fs::create_dir_all(&dir);
        let mut v = Vault { dir, key: derive(secret, machine), data: Mutex::new(HashMap::new()), restored: vec![] };
        let mut all = HashMap::new();
        for s in SLOTS {
            let (m, bad) = v.load_slot(s);
            all.extend(m);
            if bad { v.restored.push(s.to_string()); }
        }
        *v.data.lock().unwrap() = all;
        v
    }

    fn path(&self, s: &str, ext: &str) -> PathBuf { self.dir.join(format!("{s}.{ext}")) }

    fn seal(&self, s: &str, plain: &[u8]) -> Vec<u8> {
        let c = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = c.encrypt(&nonce, Payload { msg: plain, aad: s.as_bytes() }).expect("encrypt");
        let mut out = MAGIC.to_vec();
        out.extend_from_slice(&nonce);
        out.extend(ct);
        out
    }

    fn unseal(&self, s: &str, data: &[u8]) -> Option<Vec<u8>> {
        if data.len() < 4 + 12 + 16 || &data[..4] != MAGIC { return None; }
        let c = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        c.decrypt(Nonce::from_slice(&data[4..16]), Payload { msg: &data[16..], aad: s.as_bytes() }).ok()
    }

    /// Err(true) — файл існує, але пошкоджений; Err(false) — файла немає.
    fn try_read(&self, s: &str, ext: &str) -> Result<HashMap<String, String>, bool> {
        let bytes = fs::read(self.path(s, ext)).map_err(|_| false)?;
        let plain = self.unseal(s, &bytes).ok_or(true)?;
        serde_json::from_slice(&plain).map_err(|_| true)
    }

    fn load_slot(&self, s: &str) -> (HashMap<String, String>, bool) {
        match self.try_read(s, "oly") {
            Ok(m) => (m, false),
            Err(existed) => match self.try_read(s, "bak") {
                Ok(m) => (m, true),
                Err(bak_existed) => (HashMap::new(), existed || bak_existed),
            },
        }
    }

    pub fn dump(&self) -> HashMap<String, String> { self.data.lock().unwrap().clone() }

    pub fn set(&self, k: &str, v: String) -> io::Result<()> {
        let mut d = self.data.lock().unwrap();
        d.insert(k.to_string(), v);
        self.flush(&d, slot(k))
    }

    pub fn del(&self, k: &str) -> io::Result<()> {
        let mut d = self.data.lock().unwrap();
        d.remove(k);
        self.flush(&d, slot(k))
    }

    fn flush(&self, d: &HashMap<String, String>, s: &str) -> io::Result<()> {
        let sub: HashMap<&String, &String> = d.iter().filter(|(k, _)| slot(k) == s).collect();
        let sealed = self.seal(s, &serde_json::to_vec(&sub).expect("json"));
        let (main, tmp, bak) = (self.path(s, "oly"), self.path(s, "tmp"), self.path(s, "bak"));
        fs::write(&tmp, &sealed)?;
        if self.try_read(s, "oly").is_ok() { let _ = fs::copy(&main, &bak); }
        fs::rename(&tmp, &main)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn dir(n: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("olymp-vault-{n}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); d }

    #[test]
    fn roundtrip_and_encrypted_on_disk() {
        let d = dir("rt");
        let v = Vault::open(d.clone(), "s", "m");
        v.set("notes.cache", "ТАЄМНА нотатка".into()).unwrap();
        v.set("gov.ac", "#ffffff".into()).unwrap();
        let raw = fs::read(d.join("notes.oly")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("нотатка"));
        let v2 = Vault::open(d, "s", "m");
        assert_eq!(v2.dump().get("notes.cache").unwrap(), "ТАЄМНА нотатка");
        assert!(v2.restored.is_empty());
    }

    #[test]
    fn tamper_restores_from_backup() {
        let d = dir("tamper");
        let v = Vault::open(d.clone(), "s", "m");
        v.set("gov.hk", "F5".into()).unwrap();
        v.set("gov.hk", "F6".into()).unwrap(); // з'являється .bak зі значенням F5
        let mut b = fs::read(d.join("settings.oly")).unwrap();
        let n = b.len(); b[n - 3] ^= 0xFF; // «правка в блокноті»
        fs::write(d.join("settings.oly"), b).unwrap();
        let v2 = Vault::open(d, "s", "m");
        assert_eq!(v2.restored, vec!["settings".to_string()]);
        assert_eq!(v2.dump().get("gov.hk").unwrap(), "F5");
    }

    #[test]
    fn corrupt_both_resets_and_flags() {
        let d = dir("both");
        let v = Vault::open(d.clone(), "s", "m");
        v.set("laws.cache", "x".into()).unwrap();
        fs::write(d.join("cache.oly"), b"plain text").unwrap();
        let v2 = Vault::open(d, "s", "m");
        assert!(v2.restored.contains(&"cache".to_string()));
        assert!(v2.dump().get("laws.cache").is_none());
    }

    #[test]
    fn other_machine_cannot_read() {
        let d = dir("mach");
        Vault::open(d.clone(), "s", "pc-1").set("gov.ac", "#111111".into()).unwrap();
        let v = Vault::open(d, "s", "pc-2");
        assert!(v.dump().get("gov.ac").is_none() && v.restored.contains(&"settings".to_string()));
    }

    #[test]
    fn swapping_files_is_detected() {
        let d = dir("swap");
        let v = Vault::open(d.clone(), "s", "m");
        v.set("laws.cache", "a".into()).unwrap();
        v.set("notes.cache", "b".into()).unwrap();
        fs::copy(d.join("notes.oly"), d.join("cache.oly")).unwrap();
        let v2 = Vault::open(d, "s", "m");
        assert!(v2.restored.contains(&"cache".to_string()));
    }
}
