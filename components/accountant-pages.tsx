'use client'

import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  Download,
  FilePlus2,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
  Upload,
  WalletCards,
} from 'lucide-react'
import type { LedgerBudget, LedgerTransaction, LocalProfile } from './local-ledger'

export type PageId = 'Overview' | 'Transactions' | 'Budgets' | 'Reports' | 'Settings' | 'Help'

type PageProps = {
  page: PageId
  profile: LocalProfile
  transactions: LedgerTransaction[]
  budgets: LedgerBudget[]
  onAddTransaction: (input: Omit<LedgerTransaction, 'id'>) => Promise<void>
  onDeleteTransaction: (id: string) => Promise<void>
  onAddBudget: (input: Omit<LedgerBudget, 'id'>) => Promise<void>
  onDeleteBudget: (id: string) => Promise<void>
  onUpdateProfile: (name: string, currency: string) => Promise<void>
  onExportBackup: () => Promise<void>
  onRestoreBackup: (contents: string) => Promise<void>
  onDeleteProfile: () => Promise<void>
  onNavigate: (page: PageId) => void
  onLock: () => void
}

export const currencies = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'ZAR', name: 'South African rand' },
]

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

function displayDate(date: string) {
  const value = new Date(`${date}T12:00:00`)
  return Number.isNaN(value.getTime()) ? date : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)
}

function EmptyState({ icon: Icon, title, message, action, onAction }: {
  icon: LucideIcon
  title: string
  message: string
  action?: string
  onAction?: () => void
}) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon aria-hidden="true" /></div><h3>{title}</h3><p>{message}</p>{action && onAction && <button className="button button-primary" onClick={onAction}><Plus size={16} />{action}</button>}</div>
}

function TransactionForm({ categories, onSave, onCancel }: {
  categories: string[]
  onSave: PageProps['onAddTransaction']
  onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const description = String(form.get('description') ?? '').trim()
    const category = String(form.get('category') ?? '').trim()
    const date = String(form.get('date') ?? '')
    const kind = String(form.get('kind') ?? '')
    const amount = Number(form.get('amount'))
    if (!description || !category || !date || !['income', 'expense'].includes(kind) || !Number.isFinite(amount) || amount <= 0) {
      setError('Complete each field and enter an amount greater than zero.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ description, category, date, kind: kind as LedgerTransaction['kind'], amount })
      formElement.reset()
      onCancel()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The transaction could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <form className="data-form" onSubmit={submit}>
    <div className="form-heading"><div><h3>Record a transaction</h3><p>Enter the details exactly as you want them saved.</p></div><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button></div>
    <div className="form-grid">
      <label className="field field-wide">Description<input name="description" autoComplete="off" maxLength={100} required placeholder="Description" /></label>
      <label className="field">Type<select name="kind" defaultValue="" required><option value="" disabled>Select type</option><option value="expense">Expense</option><option value="income">Income</option></select></label>
      <label className="field">Amount<input name="amount" inputMode="decimal" type="number" min="0.01" step="0.01" required placeholder="Amount" /></label>
      <label className="field">Category<input name="category" list="transaction-categories" maxLength={50} required placeholder="Category" /><datalist id="transaction-categories">{categories.map(category => <option key={category} value={category} />)}</datalist></label>
      <label className="field">Date<input name="date" type="date" required /></label>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button button-primary" disabled={saving}><Plus size={16} />{saving ? 'Saving…' : 'Save transaction'}</button></div>
  </form>
}

function BudgetForm({ categories, onSave, onCancel }: {
  categories: string[]
  onSave: PageProps['onAddBudget']
  onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const category = String(form.get('category') ?? '').trim()
    const limit = Number(form.get('limit'))
    if (!category || !Number.isFinite(limit) || limit <= 0) {
      setError('Enter a category and a limit greater than zero.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ category, limit })
      formElement.reset()
      onCancel()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The budget could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <form className="data-form" onSubmit={submit}>
    <div className="form-heading"><div><h3>Create a budget</h3><p>Set a monthly limit for one spending category.</p></div><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button></div>
    <div className="form-grid form-grid-budget">
      <label className="field">Category<input name="category" list="budget-categories" maxLength={50} required placeholder="Category" /><datalist id="budget-categories">{categories.map(category => <option key={category} value={category} />)}</datalist></label>
      <label className="field">Monthly limit<input name="limit" type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="Limit" /></label>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button button-primary" disabled={saving}><Plus size={16} />{saving ? 'Saving…' : 'Save budget'}</button></div>
  </form>
}

function TransactionRows({ transactions, currency, onDelete }: {
  transactions: LedgerTransaction[]
  currency: string
  onDelete: PageProps['onDeleteTransaction']
}) {
  return <div className="records-table-wrap"><table className="records-table"><thead><tr><th scope="col">Description</th><th scope="col">Category</th><th scope="col">Date</th><th scope="col">Type</th><th scope="col" className="number-cell">Amount</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{transactions.map(transaction => <tr key={transaction.id}><td className="description-cell">{transaction.description}</td><td>{transaction.category}</td><td>{displayDate(transaction.date)}</td><td><span className={`type-tag type-${transaction.kind}`}>{transaction.kind === 'income' ? 'Income' : 'Expense'}</span></td><td className={`number-cell amount-cell amount-${transaction.kind}`}>{transaction.kind === 'income' ? '+' : '−'}{formatMoney(transaction.amount, currency)}</td><td><button className="icon-action" aria-label={`Delete ${transaction.description}`} onClick={async () => { if (!window.confirm(`Delete “${transaction.description}”?`)) return; try { await onDelete(transaction.id) } catch { return } }}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
}

function OverviewPage({ profile, transactions, budgets, currency, onNavigate, onAddFirst, onDeleteTransaction, onDeleteBudget }: Pick<PageProps, 'profile' | 'transactions' | 'budgets' | 'onNavigate' | 'onDeleteTransaction' | 'onDeleteBudget'> & { currency: string; onAddFirst: () => void }) {
  const totals = useMemo(() => transactions.reduce((result, transaction) => {
    result[transaction.kind] += transaction.amount
    return result
  }, { income: 0, expense: 0 }), [transactions])
  const recent = [...transactions].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5)
  const spendingByCategory = transactions.filter(item => item.kind === 'expense').reduce<Record<string, number>>((result, transaction) => {
    result[transaction.category] = (result[transaction.category] ?? 0) + transaction.amount
    return result
  }, {})
  const topCategories = Object.entries(spendingByCategory).sort((left, right) => right[1] - left[1]).slice(0, 4)

  return <div className="page-stack">
    <section className="welcome-panel"><div><p className="eyebrow">PERSONAL OVERVIEW</p><h2>Welcome, {profile.name}.</h2><p className="muted-copy">This space only fills with the information you choose to add.</p></div><span className="welcome-mark" aria-hidden="true"><WalletCards /></span></section>
    {transactions.length === 0 ? <EmptyState icon={FilePlus2} title="Your ledger is ready" message="There are no transactions yet. Add your first income or expense to start seeing your balance and reports." action="Add your first transaction" onAction={onAddFirst} /> : <>
      <section className="summary-grid" aria-label="Totals from your transactions">
        <article className="summary-card summary-balance"><span>Net balance</span><strong>{formatMoney(totals.income - totals.expense, currency)}</strong><small>Income minus expenses across your ledger</small></article>
        <article className="summary-card"><span>Income</span><strong>{formatMoney(totals.income, currency)}</strong><small>{transactions.filter(item => item.kind === 'income').length} recorded {transactions.filter(item => item.kind === 'income').length === 1 ? 'entry' : 'entries'}</small></article>
        <article className="summary-card"><span>Expenses</span><strong>{formatMoney(totals.expense, currency)}</strong><small>{transactions.filter(item => item.kind === 'expense').length} recorded {transactions.filter(item => item.kind === 'expense').length === 1 ? 'entry' : 'entries'}</small></article>
      </section>
      <div className="overview-columns">
        <section className="panel"><div className="panel-heading"><div><h3>Recent transactions</h3><p>Only entries from this profile</p></div><button className="text-link" onClick={() => onNavigate('Transactions')}>View all</button></div><TransactionRows transactions={recent} currency={currency} onDelete={onDeleteTransaction} /></section>
        <section className="panel"><div className="panel-heading"><div><h3>Spending by category</h3><p>Calculated from your expense entries</p></div><button className="text-link" onClick={() => onNavigate('Reports')}>Reports</button></div>{topCategories.length === 0 ? <p className="muted-copy empty-note">Your category breakdown appears after you record an expense.</p> : <div className="category-breakdown">{topCategories.map(([category, amount]) => <div className="breakdown-row" key={category}><div><span>{category}</span><strong>{formatMoney(amount, currency)}</strong></div><div className="progress-track"><span style={{ width: `${Math.max(4, (amount / topCategories[0][1]) * 100)}%` }} /></div></div>)}</div>}</section>
      </div>
      {budgets.length > 0 && <section className="panel"><div className="panel-heading"><div><h3>Your budgets</h3><p>Progress based on your expense records</p></div><button className="text-link" onClick={() => onNavigate('Budgets')}>Manage budgets</button></div><BudgetList budgets={budgets.slice(0, 3)} transactions={transactions} currency={currency} onDelete={onDeleteBudget} /></section>}
    </>}
  </div>
}

function BudgetList({ budgets, transactions, currency, onDelete }: {
  budgets: LedgerBudget[]
  transactions: LedgerTransaction[]
  currency: string
  onDelete: PageProps['onDeleteBudget']
}) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return <div className="budget-list">{budgets.map(budget => {
    const spent = transactions.filter(item => item.kind === 'expense' && item.date.startsWith(currentMonth) && item.category.toLocaleLowerCase() === budget.category.toLocaleLowerCase()).reduce((sum, item) => sum + item.amount, 0)
    const ratio = budget.limit > 0 ? spent / budget.limit : 0
    return <article className="budget-row" key={budget.id}><div className="budget-row-head"><div><h4>{budget.category}</h4><p>{formatMoney(spent, currency)} spent this month of {formatMoney(budget.limit, currency)}</p></div><button className="icon-action" aria-label={`Delete ${budget.category} budget`} onClick={async () => { try { await onDelete(budget.id) } catch { return } }}><Trash2 size={16} /></button></div><div className="progress-track budget-track"><span className={ratio >= 1 ? 'budget-over' : ''} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} /></div><p className="budget-remaining">{ratio >= 1 ? `${formatMoney(spent - budget.limit, currency)} over limit` : `${formatMoney(budget.limit - spent, currency)} remaining`}</p></article>
  })}</div>
}

function TransactionsPage({ transactions, currency, onAddTransaction, onDeleteTransaction, initiallyAdding, onInitialAddHandled }: Pick<PageProps, 'transactions' | 'onAddTransaction' | 'onDeleteTransaction'> & { currency: string; initiallyAdding: boolean; onInitialAddHandled: () => void }) {
  const [adding, setAdding] = useState(initiallyAdding)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const categories = [...new Set(transactions.map(transaction => transaction.category))].sort((a, b) => a.localeCompare(b))
  const filtered = [...transactions].filter(transaction => {
    const matchesQuery = `${transaction.description} ${transaction.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    return matchesQuery && (!kind || transaction.kind === kind)
  }).sort((left, right) => right.date.localeCompare(left.date))

  return <div className="page-stack"><div className="page-intro"><div><h2>Transactions</h2><p>Every income and expense saved to this profile.</p></div><button className="button button-primary" onClick={() => { setAdding(value => !value); onInitialAddHandled() }}><Plus size={16} />Add transaction</button></div>
    {adding && <TransactionForm categories={categories} onSave={onAddTransaction} onCancel={() => { setAdding(false); onInitialAddHandled() }} />}
    {transactions.length === 0 ? <EmptyState icon={FilePlus2} title="No transactions yet" message="Add an income or expense. You choose the description, category, date, and amount." action={adding ? undefined : 'Add transaction'} onAction={() => setAdding(true)} /> : <section className="panel"><div className="records-toolbar"><label className="search-control"><Search size={16} /><span className="sr-only">Search transactions</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your entries" /></label><label className="field filter-field"><span className="sr-only">Filter by type</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></select></label><span className="record-count">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span></div>{filtered.length ? <TransactionRows transactions={filtered} currency={currency} onDelete={onDeleteTransaction} /> : <p className="muted-copy empty-note">No entries match this search.</p>}</section>}
  </div>
}

function BudgetsPage({ budgets, transactions, currency, onAddBudget, onDeleteBudget }: Pick<PageProps, 'budgets' | 'transactions' | 'onAddBudget' | 'onDeleteBudget'> & { currency: string }) {
  const [adding, setAdding] = useState(false)
  const categories = [...new Set(transactions.filter(item => item.kind === 'expense').map(item => item.category))].sort((a, b) => a.localeCompare(b))
  return <div className="page-stack"><div className="page-intro"><div><h2>Budgets</h2><p>Set monthly spending limits that make sense for you.</p></div><button className="button button-primary" onClick={() => setAdding(value => !value)}><Plus size={16} />Create budget</button></div>
    {adding && <BudgetForm categories={categories} onSave={onAddBudget} onCancel={() => setAdding(false)} />}
    {budgets.length === 0 ? <EmptyState icon={WalletCards} title="No budgets set" message="Create a monthly limit for any category. Spending progress will be calculated only from your own expense entries." action={adding ? undefined : 'Create your first budget'} onAction={() => setAdding(true)} /> : <section className="panel"><div className="panel-heading"><div><h3>Monthly limits</h3><p>Budgets are unique to this profile.</p></div></div><BudgetList budgets={budgets} transactions={transactions} currency={currency} onDelete={onDeleteBudget} /></section>}
  </div>
}

function ReportsPage({ transactions, currency }: Pick<PageProps, 'transactions'> & { currency: string }) {
  const reports = useMemo(() => {
    const months = new Map<string, { income: number; expense: number; count: number }>()
    const categories = new Map<string, number>()
    transactions.forEach(transaction => {
      const month = transaction.date.slice(0, 7)
      const current = months.get(month) ?? { income: 0, expense: 0, count: 0 }
      current[transaction.kind] += transaction.amount
      current.count += 1
      months.set(month, current)
      if (transaction.kind === 'expense') categories.set(transaction.category, (categories.get(transaction.category) ?? 0) + transaction.amount)
    })
    return {
      months: [...months.entries()].sort(([left], [right]) => right.localeCompare(left)),
      categories: [...categories.entries()].sort((left, right) => right[1] - left[1]),
    }
  }, [transactions])
  const maxCategory = reports.categories[0]?.[1] ?? 0

  return <div className="page-stack"><div className="page-intro"><div><h2>Reports</h2><p>Summaries generated from this profile&apos;s saved transactions.</p></div></div>
    {transactions.length === 0 ? <EmptyState icon={ArrowUpRight} title="Reports need your entries" message="When you add transactions, this page will show monthly income, expenses, and category totals. Nothing is estimated or prefilled." /> : <>
      <section className="panel report-panel"><div className="panel-heading"><div><h3>Monthly activity</h3><p>Totals grouped by the dates you entered</p></div></div><div className="records-table-wrap"><table className="records-table"><thead><tr><th scope="col">Month</th><th scope="col" className="number-cell">Income</th><th scope="col" className="number-cell">Expenses</th><th scope="col" className="number-cell">Net</th><th scope="col" className="number-cell">Entries</th></tr></thead><tbody>{reports.months.map(([month, totals]) => <tr key={month}><td className="description-cell">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))}</td><td className="number-cell amount-income">{formatMoney(totals.income, currency)}</td><td className="number-cell amount-expense">{formatMoney(totals.expense, currency)}</td><td className="number-cell">{formatMoney(totals.income - totals.expense, currency)}</td><td className="number-cell">{totals.count}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-heading"><div><h3>Expense categories</h3><p>Actual recorded expenses only</p></div></div>{reports.categories.length === 0 ? <p className="muted-copy empty-note">No expense categories to report yet.</p> : <div className="category-breakdown report-categories">{reports.categories.map(([category, amount]) => <div className="breakdown-row" key={category}><div><span>{category}</span><strong>{formatMoney(amount, currency)}</strong></div><div className="progress-track"><span style={{ width: `${Math.max(3, (amount / maxCategory) * 100)}%` }} /></div></div>)}</div>}</section>
    </>}
  </div>
}

function SettingsPage({ profile, onUpdateProfile, onExportBackup, onRestoreBackup, onDeleteProfile, onLock }: Pick<PageProps, 'profile' | 'onUpdateProfile' | 'onExportBackup' | 'onRestoreBackup' | 'onDeleteProfile' | 'onLock'>) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [working, setWorking] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState('')

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const currency = String(form.get('currency') ?? '')
    if (!name || !currency) {
      setError('Enter your name and choose a currency.')
      return
    }
    setWorking(true)
    setError('')
    setSuccess('')
    try {
      await onUpdateProfile(name, currency)
      setSuccess('Profile details updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Profile details could not be updated.')
    } finally {
      setWorking(false)
    }
  }

  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setRestoreMessage('')
    setError('')
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a backup smaller than 20 MB.')
      await onRestoreBackup(await file.text())
      setRestoreMessage('Backup restored as a separate profile. Lock this profile to see it in the profile list.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This backup could not be restored.')
    } finally {
      input.value = ''
    }
  }

  async function removeProfile() {
    if (!window.confirm(`Permanently delete @${profile.username} and all of its encrypted records from this browser? This cannot be undone.`)) return
    setWorking(true)
    try {
      await onDeleteProfile()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The profile could not be deleted.')
      setWorking(false)
    }
  }

  return <div className="page-stack"><div className="page-intro"><div><h2>Settings</h2><p>Your profile and the data stored on this device.</p></div></div>
    <form className="panel settings-form" onSubmit={saveProfile}><div className="panel-heading"><div><h3>Profile details</h3><p>Changes apply only to your local profile.</p></div></div><label className="field">Full name<input name="name" defaultValue={profile.name} maxLength={80} required /></label><label className="field">Username<input value={profile.username} readOnly /></label><label className="field">Currency<select name="currency" defaultValue={profile.currency} required><option value="" disabled>Choose a currency</option>{currencies.map(currency => <option value={currency.code} key={currency.code}>{currency.code} — {currency.name}</option>)}</select></label>{error && <p className="inline-error" role="alert">{error}</p>}{success && <p className="inline-success" role="status">{success}</p>}<button className="button button-primary" disabled={working}>Save profile details</button></form>
    <section className="panel"><div className="panel-heading"><div><h3>Device data & backups</h3><p>Private to this browser profile; nothing is uploaded.</p></div></div><p className="settings-note">Transactions and budgets are encrypted in this browser using your profile password. Keep that password safe: there is no online reset. Browser storage has device limits, so keep an encrypted backup.</p><div className="settings-actions"><button className="button button-secondary" onClick={async () => { setError(''); try { await onExportBackup() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup export failed.') } }}><Download size={16} />Download encrypted backup</button><label className="button button-secondary file-button"><Upload size={16} />Restore backup<input type="file" accept="application/json,.json" onChange={restore} /></label></div>{restoreMessage && <p className="inline-success" role="status">{restoreMessage}</p>}{error && <p className="inline-error" role="alert">{error}</p>}<div className="security-note"><LockKeyhole size={17} /><p>Your profile password protects records stored in IndexedDB. The app has no cloud sync or recovery service.</p></div></section>
    <section className="panel settings-danger"><div><h3>Lock this profile</h3><p>Return to the profile picker on this device.</p></div><button className="button button-secondary" onClick={onLock}>Lock profile</button><div className="danger-divider" /><div><h3>Delete this profile</h3><p>Remove this profile and its records from this browser.</p></div><button className="button button-danger" onClick={removeProfile} disabled={working}><Trash2 size={15} />Delete profile</button></section>
  </div>
}

function HelpPage() {
  return <div className="page-stack"><div className="page-intro"><div><h2>Help & privacy</h2><p>How this local finance tracker keeps your information organized.</p></div></div><section className="panel help-list"><article><h3>How do I start?</h3><p>Open Transactions and record income or expenses with a description, category, amount, and date. Overview and Reports calculate totals from those entries only.</p></article><article><h3>How do budgets work?</h3><p>Create a monthly limit for a category. The app compares that limit with expense entries in the same category.</p></article><article><h3>Where is my data?</h3><p>Profiles, budgets, and transactions stay in this browser&apos;s local IndexedDB. No account or data is sent to a hosted service. Clearing browser site data removes local records.</p></article><article><h3>Can I use multiple profiles?</h3><p>Yes. Each profile has a unique username and password, and its ledger is encrypted separately. Lock your profile before handing the device to another person.</p></article><article><h3>Is storage unlimited?</h3><p>The app has no subscription or transaction-count cap, but available space depends on the device and browser. Download encrypted backups regularly.</p></article></section></div>
}

export default function AccountantPage({ page, profile, transactions, budgets, onAddTransaction, onDeleteTransaction, onAddBudget, onDeleteBudget, onUpdateProfile, onExportBackup, onRestoreBackup, onDeleteProfile, onNavigate, onLock }: PageProps) {
  const currency = profile.currency
  const [firstTransactionRequested, setFirstTransactionRequested] = useState(false)

  let content: ReactNode
  if (page === 'Overview') {
    content = <OverviewPage profile={profile} transactions={transactions} budgets={budgets} currency={currency} onNavigate={onNavigate} onAddFirst={() => { onNavigate('Transactions'); setFirstTransactionRequested(true) }} onDeleteTransaction={onDeleteTransaction} onDeleteBudget={onDeleteBudget} />
  } else if (page === 'Transactions') {
    content = <TransactionsPage transactions={transactions} currency={currency} onAddTransaction={onAddTransaction} onDeleteTransaction={onDeleteTransaction} initiallyAdding={firstTransactionRequested} onInitialAddHandled={() => setFirstTransactionRequested(false)} />
  } else if (page === 'Budgets') {
    content = <BudgetsPage budgets={budgets} transactions={transactions} currency={currency} onAddBudget={onAddBudget} onDeleteBudget={onDeleteBudget} />
  } else if (page === 'Reports') {
    content = <ReportsPage transactions={transactions} currency={currency} />
  } else if (page === 'Settings') {
    content = <SettingsPage profile={profile} onUpdateProfile={onUpdateProfile} onExportBackup={onExportBackup} onRestoreBackup={onRestoreBackup} onDeleteProfile={onDeleteProfile} onLock={onLock} />
  } else {
    content = <HelpPage />
  }

  return <div className="content-area"><header className="content-header"><div><p className="breadcrumb">{profile.name}<span>/</span>{page}</p><h1>{page}</h1></div><div className="header-account"><span className="profile-monogram" aria-hidden="true">{profile.name.trim().charAt(0).toLocaleUpperCase()}</span><div><strong>{profile.name}</strong><span>@{profile.username}</span></div><button className="button button-quiet" onClick={onLock}>Switch profile</button></div></header>
    <main className="page-main">{content}</main><footer className="app-footer"><span>Mine Accountant</span><span>Local-only · encrypted on this device</span></footer>
  </div>
}
