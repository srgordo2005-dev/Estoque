with open('src/App.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace('\\`', '`')
code = code.replace('\\$', '$')

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed slashes")
