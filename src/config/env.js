const path = require('path');

require('dotenv').config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
  )
});