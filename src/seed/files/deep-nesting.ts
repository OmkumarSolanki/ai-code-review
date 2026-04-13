function processRequest(req: any, db: any): string {
  if (req.method === 'POST') {
    if (req.body) {
      if (req.body.type === 'order') {
        if (req.body.items) {
          if (req.body.items.length > 0) {
            if (req.body.customer) {
              if (req.body.customer.email) {
                return db.save(req.body);
              } else {
                return 'missing email';
              }
            } else {
              return 'missing customer';
            }
          } else {
            return 'empty items';
          }
        } else {
          return 'missing items';
        }
      } else {
        return 'invalid type';
      }
    } else {
      return 'missing body';
    }
  } else {
    return 'invalid method';
  }
}

export { processRequest };
