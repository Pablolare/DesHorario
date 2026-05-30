from app import app as application

# Solo para desarrollo local: python wsgi.py
# En producción: gunicorn -w 4 -b 127.0.0.1:5001 --env SCRIPT_NAME=/destempus app:app
if __name__ == "__main__":
    application.run(debug=True, port=5001)
