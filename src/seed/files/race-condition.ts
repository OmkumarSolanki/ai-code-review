let balance = 1000;

async function withdraw(amount: number): Promise<boolean> {
  // Race condition: check-then-act without locking
  if (balance >= amount) {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulates async DB
    balance -= amount;
    return true;
  }
  return false;
}

async function deposit(amount: number): Promise<void> {
  const current = balance;
  await new Promise(resolve => setTimeout(resolve, 10));
  balance = current + amount; // Race condition: lost update
}

// Multiple concurrent withdrawals can overdraw
async function processPayments(amounts: number[]) {
  await Promise.all(amounts.map(a => withdraw(a)));
}

export { withdraw, deposit, processPayments, balance };
