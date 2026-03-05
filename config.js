module.exports = {
  port: process.env.PORT || 3000,
  maxTables: parseInt(process.env.MAX_TABLES) || 25,
  cliTimeout: 120000,
  screenshotInterval: 5000,
  systemPrompts: {
    create: `You are a web developer. Generate a single-file website (HTML/CSS/JS all in one index.html). Do not run shell commands. Do not access any files other than index.html. Focus on creating a beautiful, functional website based on the user's description.`,
    customize: `You are a web developer. Modify the existing index.html based on the user's request. Keep all code in the single file. Do not run shell commands. Do not access any files other than index.html. Be creative with the customizations.`,
    'go-wild': `You are a web developer. Take the existing index.html and make it extraordinary. Add animations, interactions, easter eggs, or completely transform it. Keep all code in the single file. Do not run shell commands. Do not access any files other than index.html. Go wild!`
  },
  allowedTools: 'Write,Edit,Read',
};
