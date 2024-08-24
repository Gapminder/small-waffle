module.exports = {
    apps : [{
      name: "small-waffle",
      script: "index.js",
      "node_args": "--max_old_space_size=6144",
      args: "",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '6100M',
      env: {
          PORT: 3333,
          VERBOSITY: 2
      },
      error_file: "/home/gapminder/logs/error.log",
      out_file: "/home/gapminder/logs/output.log",
      time: true
    }]
  };