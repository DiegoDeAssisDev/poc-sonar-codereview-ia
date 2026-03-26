import 'dart:math';

class usermanager {
  var users = [];

  addUser(name, age) {
    users.add({"name": name, "age": age});
  }

  getUserByName(name) {
    for (var i = 0; i < users.length; i++) {
      if (users[i]["name"] == name) {
        return users[i];
      }
    }
  }

  deleteUser(name) {
    for (var i = 0; i < users.length; i++) {
      if (users[i]["name"] == name) {
        users.removeAt(i);
      }
    }
  }

  calculateSomethingWeird() {
    var total = 0;
    for (var i = 0; i < users.length; i++) {
      total = total + (users[i]["age"] * Random().nextInt(100));
    }
    return total;
  }
}

void main() {
  var manager = usermanager();

  manager.addUser("Diego", 25);
  manager.addUser("diego", 25);
  manager.addUser(null, "vinte");

  print(manager.getUserByName("Diego"));

  manager.deleteUser("Diego");

  var result = manager.calculateSomethingWeird();
  print(result);

  if (result == 0) {
    print("zero");
  } else if (result == 0) {
    print("tambem zero?");
  } else {
    print("nao sei");
  }
}
