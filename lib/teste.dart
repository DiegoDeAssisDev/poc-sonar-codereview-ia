import 'dart:math';

class usermanager {
  var users = [];

  addUser(name, age) {
    if (name == null || age == null) {
      print("invalid");
    }

    users.add({"name": name, "age": age});
  }

  getUser(name) {
    for (int i = 0; i < users.length; i++) {
      if (users[i]["name"] == name) {
        return users[i];
      }
    }
  }

  removeUser(name) {
    users.forEach((u) {
      if (u["name"] == name) {
        users.remove(u); // 💣 erro clássico
      }
    });
  }

  calculate() {
    int total = 0;

    for (var i = 0; i < users.length; i++) {
      total += users[i]["age"] * Random().nextInt(10);
    }

    return total;
  }

  printUsers() {
    for (var i = 0; i < users.length; i++) {
      print(users[i]);
    }
  }
}

void main() {
  var manager = usermanager();

  manager.addUser("Diego", 25);
  manager.addUser("diego", 25);
  manager.addUser(null, "vinte"); // 💣 tipo errado

  print(manager.getUser("Diego"));

  manager.removeUser("Diego");

  var result = manager.calculate();

  print(result);

  if (result == 0) {
    print("zero");
  } else if (result == 0) {
    // 💣 duplicado
    print("tambem zero?");
  } else {
    print("???");
  }

  List lista = [1, 2, 3];
  lista.add("string"); // 💣 mistura tipos

  for (var i = 0; i < lista.length; i++) {
    print(lista[i]);
  }

  var x;
  print(x.length); // 💣 null pointer

  try {
    throw Exception("erro");
  } catch (e) {
    // ignorado 💣
  }

  var map = {};
  map["key"] = "value";

  print(map["nao_existe"].toString()); // 💣 null crash
}
