function d(x: any): any {
  const a = x.n;
  const b = x.v;
  return { r: a * b };
}

// Misleading: called getData but also writes
function getData(db: any, value: string) {
  db.write(value);
  return db.read();
}

const XYZ = 42;
const abc_DEF = 'test';
let myVar = 1;
let MY_var = 2;

export { d, getData, XYZ, abc_DEF, myVar, MY_var };
