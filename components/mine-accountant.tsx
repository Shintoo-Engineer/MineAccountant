'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CircleHelp,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Settings2,
  WalletCards,
  X,
} from 'lucide-react'
import AccountantPage, { currencies, type PageId } from './accountant-pages'
import {
  createProfile,
  deleteBudget,
  deleteProfile,
  deleteTransaction,
  listBudgets,
  listProfiles,
  listTransactions,
  makeProfileBackup,
  restoreProfileBackup,
  saveBudget,
  saveTransaction,
  unlockProfile,
  updateProfile,
  type LedgerBudget,
  type LedgerTransaction,
  type LocalProfile,
} from './local-ledger'

const navigation: { id: PageId; icon: typeof LayoutDashboard; caption: string }[] = [
  { id: 'Overview', icon: LayoutDashboard, caption: 'Your personal summary' },
  { id: 'Transactions', icon: WalletCards, caption: 'Income and expenses' },
  { id: 'Budgets', icon: BarChart3, caption: 'Monthly spending limits' },
  { id: 'Reports', icon: BarChart3, caption: 'Your recorded totals' },
  { id: 'Settings', icon: Settings2, caption: 'Profile and backups' },
  { id: 'Help', icon: CircleHelp, caption: 'How local storage works' },
]

type GateMode = 'choose' | 'create' | 'unlock'

export default function MineAccountant() {
  const [profiles, setProfiles] = useState<LocalProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState<LocalProfile | null>(null)
  const [activeProfile, setActiveProfile] = useState<LocalProfile | null>(null)
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([])
  const [budgets, setBudgets] = useState<LedgerBudget[]>([])
  const [page, setPage] = useState<PageId>('Overview')
  const [gateMode, setGateMode] = useState<GateMode>('choose')
  const [loaded, setLoaded] = useState(false)
  const [working, setWorking] = useState(false)
  const [gateError, setGateError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    listProfiles().then(result => {
      if (!mounted) return
      setProfiles(result)
      setGateMode(result.length === 0 ? 'create' : 'choose')
      setLoaded(true)
    }).catch(error => {
      if (!mounted) return
      setGateError(error instanceof Error ? error.message : 'Local browser storage could not be opened.')
      setLoaded(true)
    })
    return () => { mounted = false }
  }, [])

  function enterProfile(profile: LocalProfile, key: CryptoKey, nextTransactions: LedgerTransaction[], nextBudgets: LedgerBudget[]) {
    setActiveProfile(profile)
    setEncryptionKey(key)
    setTransactions(nextTransactions)
    setBudgets(nextBudgets)
    setPage('Overview')
    setGateError('')
    setStorageError('')
  }

  async function handleCreateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const username = String(values.get('username') ?? '').trim().toLowerCase()
    const name = String(values.get('name') ?? '').trim()
    const currency = String(values.get('currency') ?? '')
    const password = String(values.get('password') ?? '')
    const confirmation = String(values.get('confirmation') ?? '')

    setGateError('')
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
      setGateError('Use 3–24 characters for the username: letters, numbers, periods, underscores, or hyphens.')
      return
    }
    if (!name || !currencies.some(item => item.code === currency)) {
      setGateError('Enter your name and choose your currency.')
      return
    }
    if (password.length < 8) {
      setGateError('Choose a password with at least 8 characters.')
      return
    }
    if (password !== confirmation) {
      setGateError('The passwords do not match.')
      return
    }

    setWorking(true)
    try {
      const result = await createProfile({ username, name, currency, password })
      const nextProfiles = await listProfiles()
      setProfiles(nextProfiles)
      enterProfile(result.profile, result.key, [], [])
      form.reset()
    } catch (error) {
      setGateError(error instanceof Error ? error.message : 'The profile could not be created.')
    } finally {
      setWorking(false)
    }
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProfile) return
    const form = event.currentTarget
    const password = String(new FormData(form).get('password') ?? '')
    setGateError('')
    setWorking(true)
    try {
      const result = await unlockProfile(selectedProfile.id, password)
      if (!result) {
        setGateError('That password did not unlock this profile.')
        return
      }
      const [nextTransactions, nextBudgets] = await Promise.all([
        listTransactions(result.profile.id, result.key),
        listBudgets(result.profile.id, result.key),
      ])
      enterProfile(result.profile, result.key, nextTransactions, nextBudgets)
      form.reset()
    } catch (error) {
      setGateError(error instanceof Error ? error.message : 'This profile could not be opened.')
    } finally {
      setWorking(false)
    }
  }

  function lockProfile() {
    setActiveProfile(null)
    setEncryptionKey(null)
    setTransactions([])
    setBudgets([])
    setSelectedProfile(null)
    setGateMode('choose')
    setGateError('')
    setStorageError('')
  }

  async function runProfileAction(action: () => Promise<void>) {
    setStorageError('')
    try {
      await action()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'This change could not be saved on this device.')
      throw error
    }
  }

  async function addTransaction(input: Omit<LedgerTransaction, 'id'>) {
    if (!activeProfile || !encryptionKey) throw new Error('Unlock your profile before saving transactions.')
    await runProfileAction(async () => {
      const saved = await saveTransaction(activeProfile.id, encryptionKey, input)
      setTransactions(current => [saved, ...current])
    })
  }

  async function removeTransaction(id: string) {
    if (!activeProfile) return
    await runProfileAction(async () => {
      await deleteTransaction(activeProfile.id, id)
      setTransactions(current => current.filter(transaction => transaction.id !== id))
    })
  }

  async function addBudget(input: Omit<LedgerBudget, 'id'>) {
    if (!activeProfile || !encryptionKey) throw new Error('Unlock your profile before saving budgets.')
    if (budgets.some(budget => budget.category.toLocaleLowerCase() === input.category.toLocaleLowerCase())) {
      throw new Error('A budget for that category already exists in this profile.')
    }
    await runProfileAction(async () => {
      const saved = await saveBudget(activeProfile.id, encryptionKey, input)
      setBudgets(current => [...current, saved])
    })
  }

  async function removeBudget(id: string) {
    if (!activeProfile) return
    await runProfileAction(async () => {
      await deleteBudget(activeProfile.id, id)
      setBudgets(current => current.filter(budget => budget.id !== id))
    })
  }

  async function saveProfileDetails(name: string, currency: string) {
    if (!activeProfile) return
    const nextProfile = { ...activeProfile, name, currency }
    await runProfileAction(async () => {
      await updateProfile(nextProfile)
      setActiveProfile(nextProfile)
      setProfiles(current => current.map(profile => profile.id === nextProfile.id ? nextProfile : profile))
    })
  }

  async function exportBackup() {
    if (!activeProfile) throw new Error('Unlock a profile before exporting a backup.')
    await runProfileAction(async () => {
      const backup = await makeProfileBackup(activeProfile.id)
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${activeProfile.username}-mine-accountant-backup.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  async function restoreBackup(contents: string) {
    await runProfileAction(async () => {
      await restoreProfileBackup(contents)
      setProfiles(await listProfiles())
    })
  }

  async function removeProfile() {
    if (!activeProfile) return
    await deleteProfile(activeProfile.id)
    const nextProfiles = await listProfiles()
    setProfiles(nextProfiles)
    setActiveProfile(null)
    setEncryptionKey(null)
    setTransactions([])
    setBudgets([])
    setSelectedProfile(null)
    setGateMode(nextProfiles.length === 0 ? 'create' : 'choose')
    setGateError('')
    setStorageError('')
  }

  if (!loaded) return <main className="gate-shell"><div className="gate-card gate-loading" aria-live="polite">Opening local profiles…</div></main>

  if (!activeProfile || !encryptionKey) {
    return <main className="gate-shell"><section className="gate-card">
      <header className="gate-brand"><div className="brand-mark"><span /><span /><span /></div><span>mine<span>accountant</span></span></header>
      {gateMode === 'choose' && <>
        <p className="eyebrow">LOCAL FINANCE SPACE</p><h1>Choose your profile</h1><p className="gate-copy">Each profile has its own password-protected ledger on this device.</p>
        {gateError && <p className="inline-error" role="alert">{gateError}</p>}
        <div className="profile-picker">{profiles.map(profile => <button className="profile-choice" key={profile.id} onClick={() => { setSelectedProfile(profile); setGateMode('unlock'); setGateError('') }}><span className="profile-monogram">{profile.name.trim().charAt(0).toLocaleUpperCase()}</span><span><strong>{profile.name}</strong><small>@{profile.username}</small></span><ArrowRight size={17} /></button>)}</div>
        <button className="button button-secondary gate-create-link" onClick={() => { setGateMode('create'); setSelectedProfile(null); setGateError('') }}><span>Create another profile</span><ArrowRight size={16} /></button>
      </>}
      {gateMode === 'unlock' && selectedProfile && <>
        <button className="back-link" onClick={() => { setGateMode('choose'); setSelectedProfile(null); setGateError('') }}><ArrowLeft size={15} />All profiles</button>
        <div className="unlock-intro"><span className="profile-monogram profile-monogram-large">{selectedProfile.name.trim().charAt(0).toLocaleUpperCase()}</span><p className="eyebrow">WELCOME BACK</p><h1>{selectedProfile.name}</h1><p className="gate-copy">@{selectedProfile.username}</p></div>
        <form className="gate-form" onSubmit={handleUnlock}><label className="field">Password<input type="password" name="password" autoComplete="current-password" required autoFocus /></label>{gateError && <p className="inline-error" role="alert">{gateError}</p>}<button className="button button-primary gate-submit" disabled={working}>{working ? 'Unlocking…' : 'Unlock profile'}<ArrowRight size={16} /></button></form>
      </>}
      {gateMode === 'create' && <>
        <button className="back-link" onClick={() => { setGateMode(profiles.length ? 'choose' : 'create'); setGateError('') }}><ArrowLeft size={15} />{profiles.length ? 'All profiles' : 'Local setup'}</button>
        <p className="eyebrow">YOUR OWN PRIVATE SPACE</p><h1>Create your profile</h1><p className="gate-copy">No example account or starter data. Create a profile for yourself.</p>
        <form className="gate-form" onSubmit={handleCreateProfile}>
          <label className="field">Your name<input name="name" autoComplete="name" maxLength={80} required placeholder="Name" /></label>
          <label className="field">Username<input name="username" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,23}" required placeholder="3–24 characters" /></label>
          <label className="field">Currency<select name="currency" defaultValue="" required><option value="" disabled>Choose a currency</option>{currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></label>
          <label className="field">Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="field">Confirm password<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
          {gateError && <p className="inline-error" role="alert">{gateError}</p>}
          <button className="button button-primary gate-submit" disabled={working}>{working ? 'Creating profile…' : 'Create profile'}<ArrowRight size={16} /></button>
        </form>
      </>}
      <p className="gate-privacy"><LockKeyhole size={15} />Stored locally in this browser. No cloud account or subscription.</p>
    </section></main>
  }

  return <div className="accountant-shell">
    <aside className={`app-sidebar ${mobileNavOpen ? 'app-sidebar-open' : ''}`}>
      <a className="gate-brand app-brand" href="#overview" onClick={event => { event.preventDefault(); setPage('Overview'); setMobileNavOpen(false) }}><div className="brand-mark"><span /><span /><span /></div><span>mine<span>accountant</span></span></a>
      <div className="sidebar-caption">YOUR PROFILE</div><div className="sidebar-profile"><span className="profile-monogram">{activeProfile.name.trim().charAt(0).toLocaleUpperCase()}</span><span><strong>{activeProfile.name}</strong><small>@{activeProfile.username}</small></span></div>
      <div className="sidebar-caption nav-caption">WORKSPACE</div><nav className="app-nav" aria-label="Account sections">{navigation.map(({ id, icon: Icon, caption }) => <button key={id} className={`app-nav-item ${page === id ? 'app-nav-active' : ''}`} aria-current={page === id ? 'page' : undefined} title={caption} onClick={() => { setPage(id); setMobileNavOpen(false) }}><Icon size={18} strokeWidth={1.8} /><span>{id}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="offline-note"><LockKeyhole size={15} /><span>Encrypted on this device</span></div><button className="sidebar-lock" onClick={lockProfile}><LockKeyhole size={16} /><span>Lock profile</span></button></div>
    </aside>
    {mobileNavOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <div className="app-main"><div className="mobile-topbar"><button className="icon-action" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(value => !value)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button><span className="mobile-brand">mine<span>accountant</span></span></div>
      {storageError && <div className="storage-alert" role="alert">{storageError}<button className="icon-action" aria-label="Dismiss message" onClick={() => setStorageError('')}><X size={16} /></button></div>}
      <AccountantPage page={page} profile={activeProfile} transactions={transactions} budgets={budgets} onAddTransaction={addTransaction} onDeleteTransaction={removeTransaction} onAddBudget={addBudget} onDeleteBudget={removeBudget} onUpdateProfile={saveProfileDetails} onExportBackup={exportBackup} onRestoreBackup={restoreBackup} onDeleteProfile={removeProfile} onNavigate={setPage} onLock={lockProfile} />
    </div>
  </div>
}
