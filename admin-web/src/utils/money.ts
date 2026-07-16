export function formatMoney(value: string): string {
  const [integer = '0', decimal = ''] = value.split('.');
  return `¥${integer}.${decimal.padEnd(2, '0').slice(0, 2)}`;
}
