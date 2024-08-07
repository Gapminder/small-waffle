const verbosity = process.env.VERBOSITY || 2;

function nop() {}

const Log = {
    error: verbosity >= 1 ? console.error : nop,
    info: verbosity >= 2 ? console.info : nop,
    log: verbosity >= 3 ? console.log : nop,
    debug: verbosity >= 4 ? console.debug : nop, 
}

export default Log;